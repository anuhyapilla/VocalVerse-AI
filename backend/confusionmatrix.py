from sklearn.metrics import confusion_matrix, accuracy_score, precision_score, recall_score, f1_score
import seaborn as sns
import matplotlib.pyplot as plt

# Example: True labels (ground truth) and Predicted labels (from your model)
y_true = [1, 0, 1, 1, 0, 1, 0, 0, 1, 0]  # 1=Real, 0=Fake (example)
y_pred = [1, 0, 1, 0, 0, 1, 0, 1, 1, 0]

# Compute confusion matrix
cm = confusion_matrix(y_true, y_pred)

# Compute accuracy, precision, recall, f1-score
accuracy = accuracy_score(y_true, y_pred)
precision = precision_score(y_true, y_pred)
recall = recall_score(y_true, y_pred)
f1 = f1_score(y_true, y_pred)

print("Confusion Matrix:")
print(cm)
print(f"Accuracy: {accuracy:.2f}")
print(f"Precision: {precision:.2f}")
print(f"Recall: {recall:.2f}")
print(f"F1-score: {f1:.2f}")

# Plot confusion matrix using seaborn heatmap
labels = ['Fake', 'Real']
sns.heatmap(cm, annot=True, fmt='d', cmap='Blues', xticklabels=labels, yticklabels=labels)
plt.xlabel('Predicted Labels')
plt.ylabel('True Labels')
plt.title('Confusion Matrix')
plt.show()
