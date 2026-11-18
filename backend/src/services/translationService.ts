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
  const isCode = /^[a-z]{2,3}(-[a-zA-Z]{2,4})?$/i.test(trimmed);
  if (isCode) {
    return trimmed.toLowerCase();
  }
  return languageCodes[trimmed] || trimmed.toLowerCase();
}

const LT_URL = process.env.LIBRETRANSLATE_URL;
const LT_KEY = process.env.LIBRETRANSLATE_API_KEY;

async function viaLibre(
  text: string,
  target: string,
  source: string
): Promise<string> {
  const body = {
    q: text,
    source: source || "auto",
    target: target,
    format: "text",
    api_key: LT_KEY,
  };
  const url = `${LT_URL}/translate`;
  const res = await axios.post(url, body, { timeout: 8000 });
  return res.data.translatedText as string;
}

async function viaMyMemory(
  text: string,
  target: string,
  source: string
): Promise<string> {
  const from = source || "Autodetect";
  const res = await axios.get("https://api.mymemory.translated.net/get", {
    params: { q: text.slice(0, 450), langpair: `${from}|${target}` },
    timeout: 8000,
  });
  if (res.data.responseStatus !== 200) {
    throw new Error(String(res.data.responseDetails));
  }
  return res.data.responseData.translatedText as string;
}

export const translateText = async (
  text: string,
  targetLanguage: string,
  sourceLanguage?: string
): Promise<string> => {
  const target = normalizeLanguage(targetLanguage);

  let source = sourceLanguage ? normalizeLanguage(sourceLanguage) : "";
  if (source === "auto" || source === target) {
    source = "";
  }

  const attempts: Array<() => Promise<string>> = [];
  if (LT_URL) {
    attempts.push(() => viaLibre(text, target, source));
  }
  attempts.push(() => viaMyMemory(text, target, source));

  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (err: any) {
      console.error(
        "Translation attempt failed:",
        err.response?.status,
        err.response?.data || err.message
      );
    }
  }

  throw new Error("Translation unavailable");
};