import axios from "axios";

const languageCodes: Record<string, string> = {
  English: "en",
  Hindi: "hi",
  Punjabi: "pa",
  French: "fr",
  Spanish: "es",
  German: "de",
  Arabic: "ar",
  Chinese: "zh-CN",
  Japanese: "ja",
  Korean: "ko",
  Portuguese: "pt",
  Russian: "ru",
  Italian: "it",
  Bengali: "bn",
  Urdu: "ur",
  Tamil: "ta",
  Telugu: "te",
  Marathi: "mr",
  Gujarati: "gu",
};

function normalizeLanguage(language: string): string {
  const trimmed = language.trim();

  // Already a language code, e.g. "hi", "pa", "fr"
  if (/^[a-z]{2,3}(-[a-zA-Z]{2,4})?$/i.test(trimmed)) {
    return trimmed;
  }

  return languageCodes[trimmed] || trimmed.toLowerCase();
}

export const translateText = async (
  text: string,
  targetLanguage: string,
  sourceLanguage: string = "auto"
): Promise<string | null> => {
  try {
    if (!text?.trim() || !targetLanguage?.trim()) {
      return null;
    }

    const target = normalizeLanguage(targetLanguage);
    const source = normalizeLanguage(sourceLanguage);

    const response = await axios.get(
      "https://translate.googleapis.com/translate_a/single",
      {
        params: {
          client: "gtx",
          sl: source,
          tl: target,
          dt: "t",
          q: text,
        },
        timeout: 15000,
        headers: {
          "User-Agent": "Mozilla/5.0",
        },
      }
    );

    const data = response.data;

    if (!Array.isArray(data) || !Array.isArray(data[0])) {
      console.error("Unexpected translation response:", data);
      return null;
    }

    const translatedText = data[0]
      .map((part: any) => (Array.isArray(part) ? part[0] : ""))
      .filter(Boolean)
      .join("");

    if (!translatedText.trim()) {
      return null;
    }

    return translatedText;
  } catch (error: any) {
    console.error(
      "Translation failed:",
      error.response?.status,
      error.response?.data || error.message
    );

    return null;
  }
};