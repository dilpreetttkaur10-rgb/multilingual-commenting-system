
import axios from "axios";

export const translateText = async (
  text: string,
  sourceLanguage: string,
  targetLanguage: string
): Promise<string | null> => {
  try {
    const response = await axios.get(
      "https://api.mymemory.translated.net/get",
      {
        params: {
          q: text,
          langpair: `${sourceLanguage}|${targetLanguage}`,
        },
      }
    );

    const translatedText =
      response.data?.responseData?.translatedText;

    if (!translatedText) {
      return null;
    }

    return translatedText;
  } catch (error) {
    console.error("Translation error:", error);
    return null;
  }
};
