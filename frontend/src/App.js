import React, { useState, useRef } from "react";
import "./App.css";

// Maps short language codes to full SpeechSynthesisUtterance language codes
const langMap = {
  hi: "hi-IN",
  te: "te-IN",
  ta: "ta-IN",
  fr: "fr-FR",
  es: "es-ES",
  en: "en-US",
};

/**
 * Speaks the given text using the Web Speech API.
 * @param {string} text - The text to speak.
 * @param {string} lang - The language code (e.g., 'en', 'hi').
 */
const speakText = (text, lang = "en-US") => {
  if ("speechSynthesis" in window) {
    const utterance = new SpeechSynthesisUtterance(text);
    // Use the mapped language or default to en-US
    utterance.lang = langMap[lang] || lang || "en-US";
    speechSynthesis.speak(utterance);
  } else {
    console.warn("Sorry, your browser doesn't support text-to-speech.");
  }
};

function App() {
  // UI State
  const [selectedInputType, setSelectedInputType] = useState(null); // 'text', 'audio', 'video'
  const [selectedFeature, setSelectedFeature] = useState(null); // 'summarize', 'translate', 'generate_subtitles', 'transcribe_audio', 'translate_audio', 'video_translate', 'realtime_translate'
  const [showHistory, setShowHistory] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  // Text-based Feature States
  const [text, setText] = useState("");
  const [translateLang, setTranslateLang] = useState("hi"); // For translation target language
  const [summaryLang, setSummaryLang] = useState("en"); // New state for summarization language
  const [translatedText, setTranslatedText] = useState("");
  const [summaryText, setSummaryText] = useState("");

  // Audio-based Feature States
  const [audioFile, setAudioFile] = useState(null);
  const [audioTranscription, setAudioTranscription] = useState("");
  const [audioSrtDownloadUrl, setAudioSrtDownloadUrl] = useState(""); // For audio SRT download URL
  const audioFileInputRef = useRef(null); // Ref for clearing file input
  const [audioLang, setAudioLang] = useState("en"); // New state for audio transcription language

  // NEW: Real-time Audio Feature States
  const [isListening, setIsListening] = useState(false);
  const [currentInterimSpeech, setCurrentInterimSpeech] = useState(""); // For live, non-final text
  const [fullSpokenText, setFullSpokenText] = useState(""); // For cumulative final spoken text
  const [fullTranslatedText, setFullTranslatedText] = useState(""); // For cumulative final translated text
  const [realTimeTargetLang, setRealTimeTargetLang] = useState("hi"); // Target language for real-time translation
  const speechRecognition = useRef(null); // To hold the SpeechRecognition object instance

  // Video-based Feature States
  const [videoFile, setVideoFile] = useState(null);
  const [videoLang, setVideoLang] = useState("en"); // For subtitle generation language AND video translation target language
  const [transcribedVideoText, setTranscribedVideoText] = useState(""); // For original transcription (Subtitles)
  const [translatedSubtitles, setTranslatedSubtitles] = useState(""); // For translated subtitles text
  const [srtDownloadUrl, setSrtDownloadUrl] = useState(""); // For SRT download URL

  // New states for Video Translation/Dubbing
  const [translatedVideoText, setTranslatedVideoText] = useState(""); // Text of the translated/dubbed audio
  const [translatedVideoUrl, setTranslatedVideoUrl] = useState(""); // URL for the dubbed video file

  const videoFileInputRef = useRef(null); // Ref for clearing file input

  // Loading States
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // History State
  const [history, setHistory] = useState([]);

  // --- Handlers for API Calls ---

  const handleTranslate = async () => {
    if (!text.trim()) {
      setError("Please enter text to translate.");
      setTranslatedText("");
      return;
    }
    setIsLoading(true);
    setError(null);
    setTranslatedText(""); // Clear previous translation

    const formData = new FormData();
    formData.append("text", text);
    formData.append("lang", translateLang); // Use translateLang here

    try {
      const res = await fetch("http://127.0.0.1:8000/translate/", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Translation failed."); // Use errData.detail for FastAPI errors
      }

      const data = await res.json();
      setTranslatedText(data.translated);
      setHistory((prev) => [
        {
          type: "Translate",
          input: text,
          output: data.translated,
          timestamp: new Date().toLocaleString(),
        },
        ...prev,
      ]);
    } catch (err) {
      setError("❌ " + err.message);
      setTranslatedText("Error translating text.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSummarize = async () => {
    if (!text.trim()) {
      setError("Please enter text to summarize.");
      setSummaryText("");
      return;
    }
    setIsLoading(true);
    setError(null);
    setSummaryText(""); // Clear previous summary

    const formData = new FormData(); // Use FormData for consistency with other file uploads
    formData.append("text", text);
    formData.append("input_lang", "en"); // Assuming English input for now
    formData.append("output_lang", summaryLang); // Send the selected language for the summary output

    try {
      const res = await fetch("http://127.0.0.1:8000/summarize/", {
        method: "POST",
        body: formData, // Send formData
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Summarization failed."); // FastAPI uses 'detail'
      }

      const data = await res.json();
      setSummaryText(data.summary); // Use data.summary, which is now potentially translated
      setHistory((prev) => [
        {
          type: "Summarize",
          input: text,
          output: data.summary, // Store the potentially translated summary in history
          timestamp: new Date().toLocaleString(),
        },
        ...prev,
      ]);
    } catch (err) {
      setError("❌ " + err.message);
      setSummaryText("Error summarizing text.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleTranscribeAudio = async () => {
    if (!audioFile) {
      setError("Please select an audio file.");
      setAudioTranscription("");
      setAudioSrtDownloadUrl("");
      return;
    }
    setIsLoading(true);
    setError(null);
    setAudioTranscription("");
    setAudioSrtDownloadUrl("");

    const formData = new FormData();
    formData.append("file", audioFile);
    formData.append("lang", audioLang); // Language for the transcription (e.g., 'en' for English transcription)

    try {
      const res = await fetch("http://127.0.0.1:8000/upload_audio/", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Audio transcription failed.");
      }

      const data = await res.json();
      console.log('Backend response for audio transcription:', data);

      setAudioTranscription(data.transcription || "No transcription returned.");
      // Assuming your backend also returns a URL for the SRT file for audio
      setAudioSrtDownloadUrl(data.subtitle_file_url || "");

      setHistory((prev) => [
        {
          type: "Transcribe Audio",
          input: audioFile.name,
          output: data.transcription ? "Transcription generated" : "No transcription",
          timestamp: new Date().toLocaleString(),
        },
        ...prev,
      ]);
    } catch (err) {
      setError("❌ Error: " + err.message);
      setAudioTranscription("Error transcribing audio.");
    } finally {
      setIsLoading(false);
    }
  };

  // NEW: handleRealTimeTranslation function (for chunks)
  const translateRealTimeChunk = async (textChunk) => {
    if (!textChunk.trim()) return;

    // No setIsLoading(true) here to avoid blocking UI during continuous translation
    const formData = new FormData();
    formData.append("text", textChunk);
    formData.append("lang", realTimeTargetLang);

    try {
      const res = await fetch("http://127.0.0.1:8000/translate/", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Real-time translation failed.");
      }

      const data = await res.json();
      setFullTranslatedText(prev => prev + (prev ? " " : "") + data.translated);
      setHistory(prev => [
        {
          type: "Real-time Translate",
          input: `Live Chunk: "${textChunk.substring(0, 50)}..."`, // Shorten for history
          output: `Translated: "${data.translated.substring(0, 50)}..."`,
          timestamp: new Date().toLocaleString(),
        },
        ...prev,
      ]);
    } catch (err) {
      console.error("Real-time translation chunk error:", err);
      // You might want to display a temporary error on the UI if this fails frequently
    }
  };


  // NEW: startListening function for real-time
  const startListening = () => {
    if (!('webkitSpeechRecognition' in window)) {
      setError("Speech Recognition not supported in this browser. Please use Chrome.");
      return;
    }

    speechRecognition.current = new window.webkitSpeechRecognition();
    speechRecognition.current.continuous = true; // Keep listening
    speechRecognition.current.interimResults = true; // Get results as user speaks
    speechRecognition.current.lang = 'en-US'; // Set source language for recognition (can be dynamically set or auto-detected by browser)

    speechRecognition.current.onstart = () => {
      setIsListening(true);
      setCurrentInterimSpeech("");
      setFullSpokenText("");
      setFullTranslatedText("");
      setError(null);
      console.log("Speech recognition started.");
    };

    speechRecognition.current.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const segment = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += segment;
        } else {
          interimTranscript += segment;
        }
      }

      // Update interim speech display
      setCurrentInterimSpeech(interimTranscript);

      // If a final segment is available, add it to full spoken text and translate
      if (finalTranscript) {
        setFullSpokenText(prev => prev + (prev ? " " : "") + finalTranscript);
        translateRealTimeChunk(finalTranscript); // Send final chunk to backend for translation
        setCurrentInterimSpeech(""); // Clear interim once final result is processed
      }
    };

    speechRecognition.current.onerror = (event) => {
      setError("Speech recognition error: " + event.error);
      setIsListening(false);
      console.error("Speech recognition error", event);
    };

    speechRecognition.current.onend = () => {
      setIsListening(false);
      console.log("Speech recognition ended.");
      // If it ended and there's an interim result left, treat it as final
      if (currentInterimSpeech) {
          setFullSpokenText(prev => prev + (prev ? " " : "") + currentInterimSpeech);
          translateRealTimeChunk(currentInterimSpeech);
          setCurrentInterimSpeech("");
      }
    };

    try {
        speechRecognition.current.start();
    } catch (e) {
        // Handle cases where start is called while already active or other browser issues
        console.error("Failed to start speech recognition:", e);
        setError("Could not start microphone. Please ensure microphone access is granted.");
        setIsListening(false);
    }
  };

  // NEW: stopListening function
  const stopListening = () => {
    if (speechRecognition.current) {
      speechRecognition.current.stop();
      // The onend event handler will handle final processing and setting isListening to false
    }
  };


  const handleGenerateSubtitles = async () => {
    if (!videoFile) {
      setError("Please select a video file.");
      setTranscribedVideoText(""); // Clear previous
      setTranslatedSubtitles(""); // Clear previous
      setSrtDownloadUrl(""); // Clear previous
      return;
    }
    setIsLoading(true);
    setError(null);
    setTranscribedVideoText(""); // Clear previous
    setTranslatedSubtitles(""); // Clear previous
    setSrtDownloadUrl(""); // Clear previous
    setTranslatedVideoText(""); // Clear video dubbing outputs
    setTranslatedVideoUrl(""); // Clear video dubbing outputs


    const formData = new FormData();
    formData.append("file", videoFile);
    formData.append("lang", videoLang); // Language for translated subtitles text

    try {
      const res = await fetch("http://127.0.0.1:8000/generate_subtitles/", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Subtitle generation failed."); // Use errData.detail
      }

      const data = await res.json();
      console.log('Backend response for subtitles:', data); // IMPORTANT: Check this in your browser console

      setTranscribedVideoText(data.transcription || "No transcription returned.");
      setTranslatedSubtitles(data.subtitles || "No translated subtitles returned."); // This is the translated text
      setSrtDownloadUrl(data.subtitle_file_url || ""); // This is the URL for the SRT file

      setHistory((prev) => [
        {
          type: "Generate Subtitles",
          input: videoFile.name,
          output: data.subtitles ? "Subtitles generated" : "No subtitles",
          timestamp: new Date().toLocaleString(),
        },
        ...prev,
      ]);
    } catch (err) {
      setError("❌ Error: " + err.message);
      setTranscribedVideoText("Error generating transcription.");
      setTranslatedSubtitles("Error generating subtitles.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleTranslateVideo = async () => {
    if (!videoFile) {
      setError("Please select a video file.");
      setTranslatedVideoText("");
      setTranslatedVideoUrl("");
      return;
    }
    setIsLoading(true);
    setError(null);
    setTranscribedVideoText(""); // Clear subtitle outputs
    setTranslatedSubtitles(""); // Clear subtitle outputs
    setSrtDownloadUrl(""); // Clear subtitle outputs
    setTranslatedVideoText(""); // Clear previous dubbing outputs
    setTranslatedVideoUrl(""); // Clear previous dubbing outputs

    const formData = new FormData();
    formData.append("file", videoFile);
    formData.append("lang", videoLang); // Use the same videoLang for dubbing target language

    try {
      const res = await fetch("http://127.0.0.1:8000/video_translate/", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Video translation/dubbing failed.");
      }

      const data = await res.json();
      console.log('Backend response for video translation:', data); // Check this in your browser console

      setTranslatedVideoText(data.translated_text || "No translated text returned.");
      setTranslatedVideoUrl(data.output_file_url || "");

      setHistory((prev) => [
        {
          type: "Translate Video",
          input: videoFile.name,
          output: data.translated_text ? "Video translated and dubbed" : "No translation",
          timestamp: new Date().toLocaleString(),
        },
        ...prev,
      ]);
    } catch (err) {
      setError("❌ Error: " + err.message);
      setTranslatedVideoText("Error translating/dubbing video.");
    } finally {
      setIsLoading(false);
    }
  };


  // --- UI Navigation and State Management ---

  const handleBack = () => {
    setError(null); // Clear any errors on back navigation
    setIsLoading(false); // Stop loading if active
    if (selectedFeature) {
      setSelectedFeature(null);
      // Reset feature-specific outputs when going back from a feature
      setText("");
      setTranslatedText("");
      setSummaryText("");

      setAudioFile(null);
      setAudioTranscription("");
      setAudioSrtDownloadUrl(""); // Reset audio SRT URL

      // Reset real-time audio states
      setIsListening(false);
      setCurrentInterimSpeech("");
      setFullSpokenText("");
      setFullTranslatedText("");
      if (speechRecognition.current) {
          speechRecognition.current.stop(); // Ensure it stops listening
      }

      setVideoFile(null);
      setTranscribedVideoText(""); // Reset video states
      setTranslatedSubtitles(""); // Reset video states
      setSrtDownloadUrl(""); // Reset video states
      setTranslatedVideoText(""); // Reset video dubbing states
      setTranslatedVideoUrl(""); // Reset video dubbing states

      if (audioFileInputRef.current) audioFileInputRef.current.value = "";
      if (videoFileInputRef.current) videoFileInputRef.current.value = "";
    } else if (selectedInputType) {
      setSelectedInputType(null);
    }
    setShowHistory(false); // Ensure history is hidden when navigating back to main menu
  };

  const handleClearHistory = () => {
    console.log("History cleared (in a real app, this would be a custom confirmation).");
    setHistory([]);
    setShowMenu(false);
  };

  const handleSelectInputType = (type) => {
    setSelectedInputType(type);
    setSelectedFeature(null); // Reset feature when input type changes
    setError(null);
    // Clear relevant file inputs when switching input types
    if (type !== 'audio' && audioFileInputRef.current) audioFileInputRef.current.value = '';
    if (type !== 'video' && videoFileInputRef.current) videoFileInputRef.current.value = '';
    setAudioFile(null); // Also clear state directly
    setVideoFile(null); // Also clear state directly

    // Stop real-time listening if active when switching input types
    if (isListening) {
      stopListening();
    }
  };

  const handleSelectFeature = (feature) => {
    setSelectedFeature(feature);
    setError(null);
    // Stop real-time listening if active and switching features
    if (isListening && feature !== "realtime_translate") {
      stopListening();
    }
  };

  return (
    <div className="App">
      <div className="menu-icon-container">
        <button className="menu-icon-button" onClick={() => setShowMenu(!showMenu)}>
          &#8942; {/* Vertical ellipsis character */}
        </button>
        {showMenu && (
          <div className="menu-dropdown">
            <button
              onClick={() => {
                setShowHistory(true);
                setShowMenu(false);
              }}
            >
              <span role="img" aria-label="history">
                🕘
              </span>{" "}
              View History
            </button>
            <button onClick={handleClearHistory}>
              <span role="img" aria-label="clear">
                🧹
              </span>{" "}
              Clear History
            </button>
            <button onClick={() => console.log("Private Chat mode coming soon!")}>
              <span role="img" aria-label="lock">
                🔒
              </span>{" "}
              Private Chat
            </button>
          </div>
        )}
      </div>

      <div className="container">
        <h1 className="main-title">
          <span role="img" aria-label="brain" className="icon-brain">
            🧠
          </span>{" "}
          VocalVerse Using AI
        </h1>

        {showHistory ? (
          <>
            <button className="back-button" onClick={() => setShowHistory(false)}>
              <span role="img" aria-label="back">
                ←
              </span>{" "}
              Back
            </button>
            <div className="output history-output">
              <strong className="output-title">
                <span role="img" aria-label="history">
                  🕘
                </span>{" "}
                Your History:
              </strong>
              {history.length === 0 ? (
                <p className="no-history-message">No activity yet.</p>
              ) : (
                history.map((item, index) => (
                  <div key={index} className="history-item">
                    <p className="history-timestamp">{item.timestamp}</p>
                    <p className="history-type">
                      <span role="img" aria-label="type">
                        {item.type === "Translate" ? "🌍" : item.type === "Summarize" ? "🧠" : item.type === "Generate Subtitles" ? "🎞️" : item.type === "Transcribe Audio" ? "🎧" : item.type === "Translate Video" ? "🎬" : item.type === "Real-time Translate" ? "🎙️🌍" : ""}
                      </span>{" "}
                      {item.type}
                    </p>
                    <p className="history-input">
                      <span className="history-label">Input:</span> {item.input}
                    </p>
                    <p className="history-output-text">
                      <span className="history-label">Output:</span> {item.output}
                    </p>
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          <>
            {!selectedInputType && (
              <>
                <p className="input-type-prompt">Choose your input type:</p>
                <div className="feature-menu">
                  <button onClick={() => handleSelectInputType("text")}>
                    <span role="img" aria-label="text" className="icon-large">
                      📝
                    </span>
                    Text
                  </button>
                  <button onClick={() => handleSelectInputType("audio")}>
                    <span role="img" aria-label="audio" className="icon-large">
                      🎙️
                    </span>
                    Audio
                  </button>
                  <button onClick={() => handleSelectInputType("video")}>
                    <span role="img" aria-label="video" className="icon-large">
                      🎥
                    </span>
                    Video
                  </button>
                </div>
              </>
            )}

            {selectedInputType && !selectedFeature && (
              <>
                <button className="back-button" onClick={handleBack}>
                  <span role="img" aria-label="back">
                    ←
                  </span>{" "}
                  Back
                </button>
                <p className="feature-prompt">Choose a feature:</p>
                <div className="feature-menu">
                  {selectedInputType === "text" && (
                    <>
                      <button onClick={() => handleSelectFeature("summarize")}>
                        <span role="img" aria-label="summarize" className="icon-large">
                          🧠
                        </span>
                        Summarize
                      </button>
                      <button onClick={() => handleSelectFeature("translate")}>
                        <span role="img" aria-label="translate" className="icon-large">
                          🌍
                        </span>
                        Translate
                      </button>
                    </>
                  )}
                  {selectedInputType === "audio" && (
                    <>
                      <button onClick={() => handleSelectFeature("transcribe_audio")}>
                        <span role="img" aria-label="transcribe" className="icon-large">
                          🎧
                        </span>
                        Transcribe Audio File
                      </button>
                       {/* NEW: Real-time Translate button */}
                      <button onClick={() => handleSelectFeature("realtime_translate")}>
                        <span role="img" aria-label="realtime translate" className="icon-large">
                          🎙️🌍
                        </span>
                        Real-time Translate
                      </button>
                      <button onClick={() => handleSelectFeature("translate_audio")}>
  <span role="img" aria-label="translate audio" className="icon-large">
    🌍
  </span>
  Translate Audio File
</button>

                    </>
                  )}
                  {selectedInputType === "video" && (
                    <>
                      <button onClick={() => handleSelectFeature("generate_subtitles")}>
                        <span role="img" aria-label="subtitles" className="icon-large">
                          🎞️
                        </span>
                        Generate Subtitles
                      </button>
                      <button onClick={() => handleSelectFeature("video_translate")}>
                        <span role="img" aria-label="translate video" className="icon-large">
                          🎬
                        </span>
                        Translate Video
                      </button>
                    </>
                  )}
                </div>
              </>
            )}

            {selectedFeature && (
              <>
                <button className="back-button" onClick={handleBack}>
                  <span role="img" aria-label="back">
                    ←
                  </span>{" "}
                  Back
                </button>

                {error && (
                  <div className="error-message">
                    <span role="img" aria-label="error" className="icon-small">
                      ❌
                    </span>{" "}
                    {error}
                  </div>
                )}

                {selectedInputType === "text" && (
                  <>
                    <textarea
                      rows="6"
                      className="input-box"
                      placeholder="💬 Type or paste your text here..."
                      value={text}
                      onChange={(e) => {
                        setText(e.target.value);
                        setError(null); // Clear error when user types
                      }}
                    />

                    {selectedFeature === "translate" && (
                      <>
                        <div className="lang-row">
                          <label className="lang-label">
                            <span role="img" aria-label="target">
                              🎯
                            </span>{" "}
                            Choose Language:
                          </label>
                          <select value={translateLang} onChange={(e) => setTranslateLang(e.target.value)}>
                            <option value="hi">Hindi 🇮🇳</option>
                            <option value="te">Telugu 🇮🇳</option>
                            <option value="ta">Tamil 🇮🇳</option>
                            <option value="fr">French 🇫🇷</option>
                            <option value="es">Spanish 🇪🇸</option>
                            <option value="en">English 🇺🇸</option>
                          </select>
                        </div>

                        <button className="translate-btn" onClick={handleTranslate} disabled={isLoading || !text.trim()}>
                          {isLoading ? (
                            <>
                              <span role="img" aria-label="loading" className="loading-icon">
                                ⚙️
                              </span>{" "}
                              Translating...
                            </>
                          ) : (
                            <>
                              <span role="img" aria-label="translate">
                                🌍
                              </span>{" "}
                              Translate Now
                            </>
                          )}
                        </button>
                        {translatedText && (
                          <div className="output">
                            <strong className="output-title">
                              <span role="img" aria-label="translated">
                                📨
                              </span>{" "}
                              Translated Text:
                            </strong>
                            <p className="output-text">{translatedText}</p>
                            <button
                              onClick={() => speakText(translatedText, translateLang)}
                              className="speak-btn"
                              aria-label="Speak translated text"
                            >
                              🔊
                            </button>
                          </div>
                        )}
                      </>
                    )}

                    {selectedFeature === "summarize" && (
                      <>
                        <div className="lang-row">
                          <label className="lang-label">
                            <span role="img" aria-label="target">
                              🗣️
                            </span>{" "}
                            Speak Summary In:
                          </label>
                          <select value={summaryLang} onChange={(e) => setSummaryLang(e.target.value)}>
                            <option value="en">English 🇺🇸</option>
                            <option value="hi">Hindi 🇮🇳</option>
                            <option value="te">Telugu 🇮🇳</option>
                            <option value="ta">Tamil 🇮🇳</option>
                            <option value="fr">French 🇫🇷</option>
                            <option value="es">Spanish 🇪🇸</option>
                          </select>
                        </div>

                        <button className="summarize-btn" onClick={handleSummarize} disabled={isLoading || !text.trim()}>
                          {isLoading ? (
                            <>
                              <span role="img" aria-label="loading" className="loading-icon">
                                ⚙️
                              </span>{" "}
                              Summarizing...
                            </>
                          ) : (
                            <>
                              <span role="img" aria-label="summarize">
                                🧠
                              </span>{" "}
                              Summarize Text
                            </>
                          )}
                        </button>
                        {summaryText && (
                          <div className="output">
                            <strong className="output-title">
                              <span role="img" aria-label="summary">
                                📝
                              </span>{" "}
                              Summary:
                            </strong>
                            <p className="output-text">{summaryText}</p>
                            <button
                              onClick={() => speakText(summaryText, summaryLang)}
                              className="speak-btn"
                              aria-label="Speak summary"
                            >
                              🔊
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}

                {selectedInputType === "audio" && (
                  <>
                    {selectedFeature === "transcribe_audio" && (
                      <>
                        <p className="video-upload-prompt">
                          <span role="img" aria-label="upload audio">
                            🎵
                          </span>{" "}
                          Upload an audio file (.mp3, .wav):
                        </p>
                        <input
                          type="file"
                          accept="audio/*"
                          onChange={(e) => {
                            setAudioFile(e.target.files[0]);
                            setError(null);
                          }}
                          className="file-input"
                          ref={audioFileInputRef}
                        />
                        {audioFile && <p className="selected-file-name">Selected: {audioFile.name}</p>}

                        <div className="lang-row">
                            <label className="lang-label">
                                <span role="img" aria-label="target language">
                                    🎯
                                </span>{" "}
                                Transcription Language:
                            </label>
                            <select value={audioLang} onChange={(e) => setAudioLang(e.target.value)}>
                                <option value="en">English 🇺🇸</option>
                                <option value="hi">Hindi 🇮🇳</option>
                                <option value="te">Telugu 🇮🇳</option>
                                <option value="ta">Tamil 🇮🇳</option>
                                <option value="fr">French 🇫🇷</option>
                                <option value="es">Spanish 🇪🇸</option>
                            </select>
                        </div>

                        <button
                          className="translate-btn"
                          onClick={handleTranscribeAudio}
                          disabled={isLoading || !audioFile}
                        >
                          {isLoading ? (
                            <>
                              <span role="img" aria-label="loading" className="loading-icon">
                                ⚙️
                              </span>{" "}
                              Transcribing...
                            </>
                          ) : (
                            <>
                              <span role="img" aria-label="transcribe">
                                🎧
                              </span>{" "}
                              Transcribe Audio
                            </>
                          )}
                        </button>

                        {audioTranscription && (
                          <div className="output">
                            <strong className="output-title">
                              <span role="img" aria-label="transcription icon">
                                🎤
                              </span>{" "}
                              Transcription:
                            </strong>
                            <pre className="output-pre">{audioTranscription}</pre>
                            <button
                              onClick={() => speakText(audioTranscription, audioLang)}
                              className="speak-btn"
                              aria-label="Speak transcription"
                            >
                              🔊
                            </button>
                          </div>
                        )}

                        {audioSrtDownloadUrl && (
                          <div className="output">
                            <strong className="output-title">
                              <span role="img" aria-label="download icon">
                                ⬇️
                              </span>{" "}
                              Download SRT:
                            </strong>
                            <p>
                              <a href={`http://127.0.0.1:8000${audioSrtDownloadUrl}`} download className="download-link">
                                Click to Download SRT File
                              </a>
                            </p>
                          </div>
                        )}
                      </>
                    )}

                    {selectedFeature === "realtime_translate" && (
                      <>
                        <div className="lang-row">
                          <label className="lang-label">
                            <span role="img" aria-label="target language">
                              🎯
                            </span>{" "}
                            Translate To:
                          </label>
                          <select value={realTimeTargetLang} onChange={(e) => setRealTimeTargetLang(e.target.value)}>
                            <option value="hi">Hindi 🇮🇳</option>
                            <option value="te">Telugu 🇮🇳</option>
                            <option value="ta">Tamil 🇮🇳</option>
                            <option value="fr">French 🇫🇷</option>
                            <option value="es">Spanish 🇪🇸</option>
                            <option value="en">English 🇺🇸</option>
                          </select>
                        </div>

                        <button
                          className="translate-btn"
                          onClick={isListening ? stopListening : startListening}
                          disabled={isLoading}
                        >
                          {isListening ? (
                            <>
                              <span role="img" aria-label="stop listening">
                                ⏹️
                              </span>{" "}
                              Stop Real-time Subtitles
                            </>
                          ) : (
                            <>
                              <span role="img" aria-label="start listening">
                                🎙️
                              </span>{" "}
                              Start Real-time Subtitles
                            </>
                          )}
                        </button>

                        {(fullSpokenText || currentInterimSpeech) && (
                          <div className="output">
                            <strong className="output-title">
                              <span role="img" aria-label="spoken text">
                                🗣️
                              </span>{" "}
                              You Said:
                            </strong>
                            <p className="output-text">
                              {fullSpokenText}
                              <span style={{ color: 'gray', fontStyle: 'italic' }}>{currentInterimSpeech}</span>
                            </p>
                          </div>
                        )}

                        {fullTranslatedText && (
                          <div className="output">
                            <strong className="output-title">
                              <span role="img" aria-label="translated text">
                                🌐
                              </span>{" "}
                              Translated:
                            </strong>
                            <p className="output-text">{fullTranslatedText}</p>
                            <button
                              onClick={() => speakText(fullTranslatedText, realTimeTargetLang)}
                              className="speak-btn"
                              aria-label="Speak translated text"
                            >
                              🔊
                            </button>
                          </div>
                        )}
                      </>
                    )}

                    {selectedFeature === "translate_audio" && (
                        <div className="output-section">
                            <p>Translate Audio file content will go here.</p>
                        </div>
                    )}
                  </>
                )}

                {selectedInputType === "video" && (
                  <>
                    <p className="video-upload-prompt">
                      <span role="img" aria-label="upload video">
                        📹
                      </span>{" "}
                      Upload a video file:
                    </p>
                    <input
                      type="file"
                      accept="video/mp4,video/webm,video/ogg" // Common video formats
                      onChange={(e) => {
                        setVideoFile(e.target.files[0]);
                        setError(null);
                      }}
                      className="file-input"
                      ref={videoFileInputRef}
                    />
                    {videoFile && <p className="selected-file-name">Selected: {videoFile.name}</p>}

                    <div className="lang-row">
                      <label className="lang-label">
                        <span role="img" aria-label="target">
                          🎯
                        </span>{" "}
                        Choose Language:
                      </label>
                      <select value={videoLang} onChange={(e) => setVideoLang(e.target.value)}>
                        <option value="en">English 🇺🇸</option>
                        <option value="hi">Hindi 🇮🇳</option>
                        <option value="te">Telugu 🇮🇳</option>
                        <option value="ta">Tamil 🇮🇳</option>
                        <option value="fr">French 🇫🇷</option>
                        <option value="es">Spanish 🇪🇸</option>
                      </select>
                    </div>

                    {selectedFeature === "generate_subtitles" && (
                      <>
                        <button
                          className="translate-btn"
                          onClick={handleGenerateSubtitles}
                          disabled={isLoading || !videoFile}
                        >
                          {isLoading ? (
                            <>
                              <span role="img" aria-label="loading" className="loading-icon">
                                ⚙️
                              </span>{" "}
                              Generating...
                            </>
                          ) : (
                            <>
                              <span role="img" aria-label="subtitles">
                                🎞️
                              </span>{" "}
                              Generate Subtitles
                            </>
                          )}
                        </button>

                        {transcribedVideoText && (
                          <div className="output">
                            <strong className="output-title">
                              <span role="img" aria-label="transcription icon">
                                🎤
                              </span>{" "}
                              Original Transcription:
                            </strong>
                            <pre className="output-pre">{transcribedVideoText}</pre>
                          </div>
                        )}

                        {translatedSubtitles && (
                          <div className="output">
                            <strong className="output-title">
                              <span role="img" aria-label="subtitles icon">
                                📜
                              </span>{" "}
                              Translated Subtitles:
                            </strong>
                            <pre className="output-pre">{translatedSubtitles}</pre>
                            <button
                              onClick={() => speakText(translatedSubtitles, videoLang)}
                              className="speak-btn"
                              aria-label="Speak translated subtitles"
                            >
                              🔊
                            </button>
                          </div>
                        )}

                        {srtDownloadUrl && (
                          <div className="output">
                            <strong className="output-title">
                              <span role="img" aria-label="download icon">
                                ⬇️
                              </span>{" "}
                              Download SRT:
                            </strong>
                            <p>
                              <a href={`http://127.0.0.1:8000${srtDownloadUrl}`} download className="download-link">
                                Click to Download SRT File
                              </a>
                            </p>
                          </div>
                        )}
                      </>
                    )}

                    {selectedFeature === "video_translate" && (
                      <>
                        <button
                          className="translate-btn"
                          onClick={handleTranslateVideo}
                          disabled={isLoading || !videoFile}
                        >
                          {isLoading ? (
                            <>
                              <span role="img" aria-label="loading" className="loading-icon">
                                ⚙️
                              </span>{" "}
                              Translating & Dubbing...
                            </>
                          ) : (
                            <>
                              <span role="img" aria-label="translate video">
                                🎬
                              </span>{" "}
                              Translate & Dub Video
                            </>
                          )}
                        </button>

                        {translatedVideoText && (
                          <div className="output">
                            <strong className="output-title">
                              <span role="img" aria-label="translated text icon">
                                💬
                              </span>{" "}
                              Translated Audio Text:
                            </strong>
                            <pre className="output-pre">{translatedVideoText}</pre>
                            <button
                              onClick={() => speakText(translatedVideoText, videoLang)}
                              className="speak-btn"
                              aria-label="Speak translated video text"
                            >
                              🔊
                            </button>
                          </div>
                        )}
                        {translatedVideoUrl && (
                          <div className="output">
                            <strong className="output-title">
                              <span role="img" aria-label="download video icon">
                                ⬇️
                              </span>{" "}
                              Download Dubbed Video:
                            </strong>
                            <p>
                              <a href={`http://127.0.0.1:8000${translatedVideoUrl}`} download className="download-link">
                                Click to Download Dubbed Video
                              </a>
                            </p>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default App;