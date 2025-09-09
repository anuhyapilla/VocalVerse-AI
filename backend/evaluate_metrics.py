from jiwer import wer
from sacrebleu import corpus_bleu
from rouge_score import rouge_scorer

# ----- SAMPLE DATA (you can replace these with your own) -----
# 📌 For Transcription Accuracy
actual_transcript = "this is a test of the speech recognition model"
expected_transcript = "this is a test for the speech recognition module"

# 📌 For Translation Accuracy
actual_translation = "Ceci est un test"
expected_translation = "Ceci est un test"

# 📌 For Summarization Accuracy
actual_summary = "The project is about AI for speech translation"
expected_summary = "This project uses AI to translate speech"

# ----- METRICS -----

# 1️⃣ Word Error Rate for Transcription
transcription_wer = wer(expected_transcript, actual_transcript)
print(f"📝 Transcription Accuracy (WER): {round((1 - transcription_wer)*100, 2)}%")

# 2️⃣ BLEU Score for Translation
bleu = corpus_bleu([actual_translation], [[expected_translation]])
print(f"🌍 Translation Accuracy (BLEU): {round(bleu.score, 2)}")

# 3️⃣ ROUGE Score for Summarization
scorer = rouge_scorer.RougeScorer(['rouge1', 'rouge2', 'rougeL'], use_stemmer=True)
scores = scorer.score(expected_summary, actual_summary)
print("🧠 Summarization Accuracy (ROUGE):")
for key, score in scores.items():
    print(f"   {key.upper()}: Precision={score.precision:.2f}, Recall={score.recall:.2f}, F1={score.fmeasure:.2f}")
