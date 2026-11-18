import axios from "axios";

const languageCodes: Record<string, string> = {
  English: "en",
  Hindi: "hi",
  Punjabi: "pa",
  French: "fr",
  Spanish: "es",
  German: "de",
  Arabic: "ar",
  Chinese: "zh",
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

  if (/^[a-z]{2,3}(-[a-zA-Z]{2,4})?$/i.test(trimmed)) {
    return trimmed.toLowerCase();
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

    const response = await axios.post(
      "https://libretranslate.de/translate",
      {
        q: text,
        source: normalizeLanguage(sourceLanguage),
        target: normalizeLanguage(targetLanguage),
        format: "text",
      },
      {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        timeout: 20000,
      }
    );

    const translatedText = response.data?.translatedText;

    if (
      typeof translatedText !== "string" ||
      !translatedText.trim()
    ) {
      console.error("Invalid LibreTranslate response:", response.data);
      return null;
    }

    return translatedText;
  } catch (error: any) {
    console.error(
      "LibreTranslate failed:",
      error.response?.status,
      error.response?.data || error.message
    );

    return null;
  }
};