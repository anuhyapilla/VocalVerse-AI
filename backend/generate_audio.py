from gtts import gTTS
from pydub import AudioSegment

# Text to convert to audio
text = "Hello, this is a test MP3 file for vocalverse AI project."

# Convert text to speech and save as MP3
tts = gTTS(text)
tts.save("sample.mp3")

# Optional: convert to WAV if needed
# sound = AudioSegment.from_mp3("sample.mp3")
# sound.export("sample.wav", format="wav")

print("✅ Audio file 'sample.mp3' generated!")
