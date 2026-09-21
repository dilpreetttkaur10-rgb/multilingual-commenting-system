const badWords = [
  "fuck",
  "fucking",
  "shit",
  "bitch",
  "asshole",
  "bastard",
];

export const containsProfanity = (text: string): boolean => {
  const lowerText = text.toLowerCase();

  return badWords.some((word) => {
    const pattern = new RegExp(`\\b${word}\\b`, "i");
    return pattern.test(lowerText);
  });
};

// Spam detection
export const isSpam = (text: string): boolean => {
  // Too many links
  const links = text.match(/https?:\/\/|www\./gi) || [];

  if (links.length >= 3) {
    return true;
  }

  // Excessive capital letters
  const letters = text.match(/[A-Za-z]/g) || [];
  const capitals = text.match(/[A-Z]/g) || [];

  if (
    letters.length >= 10 &&
    capitals.length / letters.length > 0.8
  ) {
    return true;
  }

  return false;
};

// Malicious/suspicious link detection
export const containsMaliciousLink = (text: string): boolean => {
  const suspiciousPatterns = [
    /bit\.ly/i,
    /tinyurl\.com/i,
    /t\.co/i,
    /goo\.gl/i,
    /free-money/i,
    /free-prize/i,
    /click-here/i,
    /verify-account/i,
    /login-now/i,
    /claim-prize/i,
  ];

  return suspiciousPatterns.some((pattern) =>
    pattern.test(text)
  );
};

// Repeated character / emoji detection
export const hasExcessiveRepetition = (
  text: string
): boolean => {
  // Same character repeated 8 or more times
  if (/(.)\1{7,}/u.test(text)) {
    return true;
  }

  // Excessive emoji repetition
  const emojiMatches =
    text.match(/[\u{1F300}-\u{1FAFF}]/gu) || [];

  if (emojiMatches.length >= 8) {
    const uniqueEmojis = new Set(emojiMatches);

    if (
      uniqueEmojis.size === 1 ||
      emojiMatches.length / uniqueEmojis.size >= 5
    ) {
      return true;
    }
  }

  return false;
};