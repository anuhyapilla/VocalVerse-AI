import sys
import os
import uuid
import shutil
import asyncio

# Add the virtual environment's site-packages to sys.path
VENV_SITE_PACKAGES = os.path.join(os.path.dirname(__file__), 'venv', 'Lib', 'site-packages')
if VENV_SITE_PACKAGES not in sys.path:
    sys.path.insert(0, VENV_SITE_PACKAGES)

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware

# Import core libraries
from googletrans import Translator
from transformers import pipeline
from gtts import gTTS
import whisper
import moviepy.editor as mp

app = FastAPI()

# Configure CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Directory to store uploaded and generated files
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# --- Global Model and Library Initialization ---
global_translator = None
try:
    global_translator = Translator()
    print("INFO: Google Translator initialized.")
except Exception as e:
    print(f"ERROR: Failed to initialize Google Translator: {e}")

global_summarizer = None
try:
    # Using a larger max_length for potentially more comprehensive summaries
    # This model is primarily for English summarization.
    global_summarizer = pipeline(
    "summarization",
    model="facebook/bart-large-cnn"
)


    print("INFO: Summarization model (facebook/bart-large-cnn) loaded.")
except Exception as e:
    print(f"ERROR: Failed to load summarization model: {e}")

global_whisper_model = None
try:
    global_whisper_model = whisper.load_model("base")
    print("INFO: Whisper model ('base') loaded.")
except Exception as e:
    print(f"ERROR: Failed to load Whisper model: {e}")

# --- Helper Functions ---

def generate_srt(segments: list, srt_path: str):
    """
    Generates an SRT (SubRip Subtitle) file from Whisper transcription segments.
    """
    def format_timestamp(seconds: float) -> str:
        millis = int(seconds * 1000)
        hours = millis // 3600000
        minutes = (millis % 3600000) // 60000
        seconds = (millis % 60000) // 1000
        milliseconds = millis % 1000
        return f"{hours:02}:{minutes:02}:{seconds:02},{milliseconds:03}"

    with open(srt_path, "w", encoding="utf-8") as srt_file:
        for i, segment in enumerate(segments, start=1):
            start = format_timestamp(segment["start"])
            end = format_timestamp(segment["end"])
            text = segment["text"].strip()
            srt_file.write(f"{i}\n{start} --> {end}\n{text}\n\n")

# --- API Endpoints ---

@app.get("/uploads/{filename}")
async def serve_file(filename: str):
    file_path = os.path.join(UPLOAD_DIR, filename)
    if os.path.exists(file_path):
        return FileResponse(path=file_path, filename=filename)
    raise HTTPException(status_code=404, detail="File not found.")

@app.post("/translate/")
async def translate_text(text: str = Form(...), lang: str = Form(...)):
    """
    Translates input text to a specified target language using googletrans.
    """
    if global_translator is None:
        raise HTTPException(status_code=500, detail="Translator not initialized. Backend error.")
    if not text.strip():
        raise HTTPException(status_code=400, detail="Text to translate cannot be empty.")

    try:
        translated = global_translator.translate(text, dest=lang)
        return JSONResponse(content={
            "original": text,
            "translated": translated.text,
            "target_language": lang
        }, status_code=200)
    except Exception as e:
        print(f"Error during text translation: {e}")
        raise HTTPException(status_code=500, detail=f"Translation failed: {str(e)}")

@app.post("/summarize/")
async def summarize_text(text: str = Form(...), input_lang: str = Form("en"), output_lang: str = Form("en")):
    """
    Summarizes input text.
    - If input_lang is not English, it translates the text to English first.
    - Summarizes the English text.
    - Optionally translates the summary to output_lang if specified and different from English.
    """
    if global_summarizer is None:
        raise HTTPException(status_code=500, detail="Summarization model not loaded. Backend error.")
    if global_translator is None:
        raise HTTPException(status_code=500, detail="Translator not initialized. Backend error.")
    if not text.strip():
        raise HTTPException(status_code=400, detail="Text to summarize cannot be empty.")

    # Convert words to character count for more robust short text check
    # A typical word is 5-6 characters, so 20 words is ~100-120 characters
    if len(text) < 100: # Min character length for summarization
        # Adjusting the error message to be more generic for length
        raise HTTPException(status_code=400, detail="Input text is too short for meaningful summarization. Please provide at least 100 characters.")

    processed_text = text
    translation_performed = False
    original_lang = input_lang # Keep track of original input language

    try:
        # Step 1: Translate input text to English if not already English
        if input_lang != "en":
            print(f"Translating input from {input_lang} to English for summarization...")
            translated_to_english = global_translator.translate(text, dest="en")
            processed_text = translated_to_english.text
            translation_performed = True

        # Step 2: Summarize the English text
        # Dynamically adjust max_length and min_length based on input text length
        # Using a simple heuristic: summary length is roughly 15-30% of input length,
        # with a cap to prevent overly long summaries.
        input_length_words = len(processed_text.split())
        calculated_min_length = 60
        calculated_max_length = 250


        # Fallback for very short texts after translation if they slip through the initial check
        if input_length_words < 20: # If after translation, it's still too short for the summarizer
             raise HTTPException(status_code=400, detail="Translated text is too short for meaningful summarization. Please provide more input.")

        summary_result = global_summarizer(
    f"Summarize: {processed_text}",
    max_length=calculated_max_length,
    min_length=calculated_min_length,
    do_sample=False
)

        english_summary = summary_result[0]['summary_text']

        final_summary = english_summary
        # Step 3: Translate the summary back to the desired output language if specified and different from English
        if output_lang != "en" and output_lang != input_lang: # Only translate if target output is different from English and not the original input lang (handled by TTS)
            print(f"Translating summary from English to {output_lang}...")
            translated_summary = global_translator.translate(english_summary, dest=output_lang)
            final_summary = translated_summary.text
        # Note: Frontend handles TTS in `summaryLang` which can be different from `output_lang`

        return JSONResponse(content={
            "original_text": text,
            "processed_for_summarization": processed_text, # Show what was summarized
            "summary": final_summary,
            "summarized_in_english": english_summary, # Always return English summary as well
            "input_language": original_lang,
            "output_language": output_lang # Language of the returned 'summary' field
        }, status_code=200)

    except Exception as e:
        print(f"Error during text summarization: {e}")
        # Provide more specific error messages for debugging
        if "max_length" in str(e) and "min_length" in str(e):
             raise HTTPException(status_code=500, detail=f"Summarization model error: Max/Min length issue. Try different input or adjust backend model parameters. Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Summarization failed: {str(e)}")

@app.post("/upload_audio/") # Renamed from /upload/ to be more specific
async def upload_audio_file(file: UploadFile = File(...)):
    """
    Handles audio file uploads, transcribes them using Whisper,
    translates the transcription, and generates an SRT subtitle file.
    """
    if global_whisper_model is None:
        raise HTTPException(status_code=500, detail="Whisper model not loaded. Backend error.")
    if global_translator is None:
        raise HTTPException(status_code=500, detail="Translator not initialized. Backend error.")

    # Generate a unique filename to prevent conflicts
    file_extension = file.filename.split('.')[-1] if '.' in file.filename else 'mp3'
    unique_filename = f"{uuid.uuid4()}.{file_extension}"
    file_path = os.path.join(UPLOAD_DIR, unique_filename)

    try:
        # Save the uploaded file
        with open(file_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        # Transcribe the audio file
        result = global_whisper_model.transcribe(file_path)
        original_text = result["text"]
        segments = result["segments"]

        # Generate SRT subtitle file
        srt_filename = f"{unique_filename.rsplit('.', 1)[0]}.srt"
        srt_path = os.path.join(UPLOAD_DIR, srt_filename)
        generate_srt(segments, srt_path)

        # Translate the original transcription to English (or a default language)
        translated = global_translator.translate(original_text, dest="en") # Default to English for transcription translation

        return JSONResponse(content={
            "message": "Audio upload and processing successful!",
            "transcription": original_text,
            "translation": translated.text,
            "subtitle_file_url": f"/uploads/{srt_filename}" # URL to download the SRT
        }, status_code=200)

    except Exception as e:
        print(f"Error during audio file upload and processing: {e}")
        raise HTTPException(status_code=500, detail=f"Audio processing failed: {str(e)}")
    finally:
        # Clean up the original uploaded audio file after processing
        if os.path.exists(file_path):
            os.remove(file_path)

@app.post("/generate_subtitles/") # <-- THIS IS THE CORRECTED ENDPOINT NAME
async def generate_subtitles(file: UploadFile = File(...), lang: str = Form("en")):
    """
    Extracts audio from a video, transcribes it using Whisper,
    and generates an SRT subtitle file.
    Optionally translates the subtitles to a target language.
    """
    if global_whisper_model is None:
        raise HTTPException(status_code=500, detail="Whisper model not loaded. Backend error.")
    if global_translator is None:
        raise HTTPException(status_code=500, detail="Translator not initialized. Backend error.")

    # Generate unique filenames
    video_extension = file.filename.split('.')[-1] if '.' in file.filename else 'mp4'
    unique_video_filename = f"{uuid.uuid4()}.{video_extension}"
    video_path = os.path.join(UPLOAD_DIR, unique_video_filename)
    audio_path = video_path.replace(f".{video_extension}", ".mp3")
    srt_filename = f"{unique_video_filename.rsplit('.', 1)[0]}.srt"
    srt_path = os.path.join(UPLOAD_DIR, srt_filename)

    clip = None # Initialize clip to None for finally block

    try:
        # Save video file
        with open(video_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Extract audio from video using moviepy
        clip = mp.VideoFileClip(video_path)
        clip.audio.write_audiofile(audio_path)
        clip.close() # Close the clip to release file handles

        # Transcribe audio
        print(f"Transcribing audio from {audio_path}...")
        result = global_whisper_model.transcribe(audio_path)
        transcribed_text = result["text"]
        segments = result["segments"]

        # Generate SRT in detected language first (Whisper's output)
        generate_srt(segments, srt_path)

        final_subtitles_text = transcribed_text
        if lang != "en":
            print(f"Translating transcription to {lang}...")
            translated_result = global_translator.translate(transcribed_text, dest=lang)
            final_subtitles_text = translated_result.text
            # Note: The SRT file generated above is based on the original transcription.
            # If you need a translated SRT, you'd have to translate each segment and
            # regenerate the SRT file. For now, the 'subtitles' field in the JSON
            # response will contain the translated text, but the downloadable SRT
            # will be in the original transcribed language.

        return JSONResponse(content={
            "message": "Subtitles generated successfully!",
            "transcription": transcribed_text,
            "subtitles": final_subtitles_text, # This will be translated if lang != "en"
            "subtitle_file_url": f"/uploads/{srt_filename}" # This SRT is from original transcription
        }, status_code=200)

    except Exception as e:
        print(f"Error during video subtitle generation: {e}")
        raise HTTPException(status_code=500, detail=f"Video subtitle generation failed: {str(e)}. Ensure FFmpeg is installed and in your system's PATH.")
    finally:
        # Clean up temporary files
        if clip:
            clip.close() # Ensure original clip is closed
        if os.path.exists(video_path):
            os.remove(video_path)
        if os.path.exists(audio_path):
            os.remove(audio_path)
        # Keep SRT file for download

@app.post("/video_translate/")
async def video_translate(file: UploadFile = File(...), lang: str = Form(...)):
    """
    Transcribes video, translates the transcription, converts translated text to speech,
    and replaces the original video's audio with the new translated audio.
    """
    if global_whisper_model is None:
        raise HTTPException(status_code=500, detail="Whisper model not loaded. Backend error.")
    if global_translator is None:
        raise HTTPException(status_code=500, detail="Translator not initialized. Backend error.")

    # Generate unique filenames
    video_extension = file.filename.split('.')[-1] if '.' in file.filename else 'mp4'
    unique_video_filename = f"{uuid.uuid4()}.{video_extension}"
    video_path = os.path.join(UPLOAD_DIR, unique_video_filename)
    audio_path = video_path.replace(f".{video_extension}", ".mp3")
    tts_path = video_path.replace(f".{video_extension}", "_tts.mp3")
    output_filename = f"{unique_video_filename.rsplit('.', 1)[0]}_translated.mp4"
    output_path = os.path.join(UPLOAD_DIR, output_filename)

    clip = None # Initialize clip to None for finally block

    try:
        # Save video file
        with open(video_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Extract audio
        clip = mp.VideoFileClip(video_path)
        clip.audio.write_audiofile(audio_path)

        # Transcribe
        result = global_whisper_model.transcribe(audio_path)
        original_text = result["text"]

        # Translate
        translated = global_translator.translate(original_text, dest=lang).text

        # Convert translated text to speech
        # gTTS supports many languages, ensure 'lang' is a valid ISO 639-1 code
        tts = gTTS(translated, lang=lang)
        tts.save(tts_path)

        # Replace original audio with TTS audio
        new_audio = mp.AudioFileClip(tts_path)
        # Ensure the new audio clip duration matches the video clip duration
        if new_audio.duration > clip.duration:
            new_audio = new_audio.subclip(0, clip.duration)
        elif new_audio.duration < clip.duration:
            # Pad with silence or loop if needed, for now just use shorter audio
            pass # moviepy will handle shorter audio by ending the sound

        final_clip = clip.set_audio(new_audio)
        final_clip.write_videofile(output_path, codec="libx264", audio_codec="aac")
        final_clip.close() # Close the final clip to release file handles
        new_audio.close() # Close the new audio clip

        return JSONResponse(content={
            "message": "Translated video created!",
            "translated_text": translated,
            "output_file_url": f"/uploads/{output_filename}" # URL to download the translated video
        }, status_code=200)

    except Exception as e:
        print(f"Error during video translation and dubbing: {e}")
        raise HTTPException(status_code=500, detail=f"Video translation failed: {str(e)}. Ensure FFmpeg is installed and in your system's PATH.")
    finally:
        # Clean up temporary files
        if clip:
            clip.close() # Ensure original clip is closed
        if os.path.exists(video_path):
            os.remove(video_path)
        if os.path.exists(audio_path):
            os.remove(audio_path)
        if os.path.exists(tts_path):
            os.remove(tts_path)