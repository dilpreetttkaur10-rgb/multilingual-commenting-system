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
const MYMEMORY_EMAIL = process.env.MYMEMORY_EMAIL;

const cache = new Map<string, string>();
const CACHE_LIMIT = 1000;

function saveToCache(key: string, value: string): void {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) {
      cache.delete(oldest);
    }
  }
  cache.set(key, value);
}

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

async function viaGoogleFree(
  text: string,
  target: string,
  source: string
): Promise<string> {
  const tl = target === "zh" ? "zh-CN" : target;
  const res = await axios.get(
    "https://translate.googleapis.com/translate_a/single",
    {
      params: {
        client: "gtx",
        sl: source || "auto",
        tl: tl,
        dt: "t",
        q: text,
      },
      timeout: 8000,
    }
  );
  const chunks = res.data && res.data[0];
  if (!Array.isArray(chunks)) {
    throw new Error("Unexpected response from Google translate");
  }
  const result = chunks.map((c: any[]) => c[0]).join("");
  if (!result) {
    throw new Error("Empty translation");
  }
  return result;
}

async function viaMyMemory(
  text: string,
  target: string,
  source: string
): Promise<string> {
  const from = source || "Autodetect";
  const params: Record<string, string> = {
    q: text.slice(0, 450),
    langpair: `${from}|${target}`,
  };
  if (MYMEMORY_EMAIL) {
    params.de = MYMEMORY_EMAIL;
  }
  const res = await axios.get("https://api.mymemory.translated.net/get", {
    params: params,
    timeout: 8000,
  });
  if (Number(res.data.responseStatus) !== 200) {
    throw new Error(String(res.data.responseDetails));
  }
  return res.data.responseData.translatedText as string;
}
export async function translateText(
  text: string,
  targetLanguage: string,
  sourceLanguage?: string
): Promise<string> {
  const target = normalizeLanguage(targetLanguage);

  let source = sourceLanguage ? normalizeLanguage(sourceLanguage) : "";
  if (source === "auto" || source === target) {
    source = "";
  }

  const cacheKey = `${source}|${target}|${text}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const attempts: Array<() => Promise<string>> = [];
  if (LT_URL) {
    attempts.push(() => viaLibre(text, target, source));
  }
  attempts.push(() => viaGoogleFree(text, target, source));
  attempts.push(() => viaMyMemory(text, target, source));

  for (const attempt of attempts) {
    try {
      const result = await attempt();
      saveToCache(cacheKey, result);
      return result;
    } catch (err: any) {
      console.error(
        "Translation attempt failed:",
        err.response?.status,
        err.response?.data || err.message
      );
    }
  }

  throw new Error("Translation unavailable");
}