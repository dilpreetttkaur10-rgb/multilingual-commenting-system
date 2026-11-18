import axios from "axios";

const MYMEMORY_URL =
  "https://api.mymemory.translated.net/get";

const GOOGLE_URL =
  "https://translate.googleapis.com/translate_a/single";

const LIBRETRANSLATE_URL =
  process.env.LIBRETRANSLATE_URL ||
  "https://libretranslate.com/translate";

// Provider 1: Google (unofficial endpoint)
const translateWithGoogle = async (
  text: string,
  sourceLanguage: string,
  targetLanguage: string
): Promise<string | null> => {
  try {
    const response = await axios.get(GOOGLE_URL, {
      params: {
        client: "gtx",
        sl: sourceLanguage,
        tl: targetLanguage,
        dt: "t",
        q: text,
      },
      timeout: 15000,
    });

    const segments = response.data?.[0];

    if (Array.isArray(segments)) {
      const translatedText = segments
        .map((segment: any) =>
          Array.isArray(segment) ? segment[0] : ""
        )
        .filter(Boolean)
        .join("");

      if (translatedText.trim()) {
        return translatedText;
      }
    }

    return null;
  } catch (error) {
    console.error("Google translation failed:", error);
    return null;
  }
};

// Provider 2: MyMemory
const translateWithMyMemory = async (
  text: string,
  sourceLanguage: string,
  targetLanguage: string
): Promise<string | null> => {
  try {
    const response = await axios.get(MYMEMORY_URL, {
      params: {
        q: text,
        langpair: `${sourceLanguage}|${targetLanguage}`,
      },
      timeout: 10000,
    });

    const translatedText =
      response.data?.responseData?.translatedText;

    if (
      typeof translatedText === "string" &&
      translatedText.trim() &&
      response.data?.responseStatus === 200
    ) {
      return translatedText;
    }

    console.warn("MyMemory translation unavailable.");
    return null;
  } catch (error) {
    console.error("MyMemory provider failed:", error);
    return null;
  }
};

// Provider 3: LibreTranslate
const translateWithLibreTranslate = async (
  text: string,
  sourceLanguage: string,
  targetLanguage: string
): Promise<string | null> => {
  try {
    const apiKey = process.env.LIBRETRANSLATE_API_KEY;

    if (
      !apiKey &&
      !process.env.LIBRETRANSLATE_URL
    ) {
      console.warn("LibreTranslate is not configured.");
      return null;
    }

    const response = await axios.post(
      LIBRETRANSLATE_URL,
      {
        q: text,
        source: sourceLanguage,
        target: targetLanguage,
        format: "text",
        ...(apiKey ? { api_key: apiKey } : {}),
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );

    const translatedText =
      response.data?.translatedText;

    if (
      typeof translatedText === "string" &&
      translatedText.trim()
    ) {
      return translatedText;
    }

    return null;
  } catch (error) {
    console.error("LibreTranslate provider failed:", error);
    return null;
  }
};

// Main translation function
export const translateText = async (
  text: string,
  sourceLanguage: string,
  targetLanguage: string
): Promise<string | null> => {
  if (!text || !text.trim()) {
    return null;
  }

  // Try Google first
  console.log("Trying Google translation...");

  const googleTranslation = await translateWithGoogle(
    text,
    sourceLanguage,
    targetLanguage
  );

  if (googleTranslation) {
    console.log("Translation completed using Google.");
    return googleTranslation;
  }

  // Try MyMemory second
  console.log("Trying MyMemory fallback...");

  const myMemoryTranslation = await translateWithMyMemory(
    text,
    sourceLanguage,
    targetLanguage
  );

  if (myMemoryTranslation) {
    console.log("Translation completed using MyMemory.");
    return myMemoryTranslation;
  }

  // Try LibreTranslate third
  console.log("Trying LibreTranslate fallback...");

  const libreTranslation = await translateWithLibreTranslate(
    text,
    sourceLanguage,
    targetLanguage
  );

  if (libreTranslation) {
    console.log("Translation completed using LibreTranslate.");
    return libreTranslation;
  }

  console.error("All translation providers failed.");
  return null;
};