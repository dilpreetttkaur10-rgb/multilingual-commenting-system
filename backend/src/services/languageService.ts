
export const detectLanguage = (text: string): string | null => {
  try {
    const cleanedText = text.trim();

    if (!cleanedText) {
      return null;
    }

    // Hindi - Devanagari script
    if (/[\u0900-\u097F]/.test(cleanedText)) {
      return "hi";
    }

    // Punjabi - Gurmukhi script
    if (/[\u0A00-\u0A7F]/.test(cleanedText)) {
      return "pa";
    }

    // Common English words
    const englishWords = [
      "hello",
      "hi",
      "how",
      "are",
      "you",
      "the",
      "this",
      "that",
      "is",
      "am",
      "i",
      "we",
      "good",
      "great",
      "nice",
      "thanks",
      "thank",
      "agree",
      "comment",
      "what",
      "why",
      "can",
      "please",
      "welcome",
      "how are you",
    ];

    const lowerText = cleanedText.toLowerCase();

    // Check for common English words
    const containsEnglishWord = englishWords.some((word) =>
      lowerText.includes(word)
    );

    if (containsEnglishWord) {
      return "en";
    }

    // For unsupported/uncertain text
    return null;
  } catch (error) {
    console.error("Language detection error:", error);
    return null;
  }
};

