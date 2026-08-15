import toast from "react-hot-toast";
import {
  ConfigService,
  TokenService,
} from "../../assets/lib/kookit-extra-browser.min";
import i18n from "../../i18n";
import { getTempToken } from "./user";

// Language code mapper for Google Translate
const normalizeLangCode = (lang: string): string => {
  if (!lang || lang.toLowerCase() === "automatic" || lang === "Auto") return "auto";
  const l = lang.toLowerCase();
  if (l.includes("zh-tw") || l.includes("traditional") || l.includes("繁体") || l.includes("繁體") || l.includes("cht")) return "zh-TW";
  if (l.includes("zh-cn") || l.includes("simplified") || l.includes("简体") || l.includes("簡體") || l.includes("zh")) return "zh-CN";
  if (l.includes("en") || l.includes("eng")) return "en";
  if (l.includes("ja") || l.includes("jpn")) return "ja";
  if (l.includes("ko") || l.includes("kor")) return "ko";
  if (l.includes("fr") || l.includes("fra")) return "fr";
  if (l.includes("de") || l.includes("ger")) return "de";
  if (l.includes("es") || l.includes("spa")) return "es";
  if (l.includes("ru") || l.includes("rus")) return "ru";
  if (l.includes("it") || l.includes("ita")) return "it";
  if (l.includes("pt") || l.includes("por")) return "pt";
  return lang;
};

/**
 * 1. Online Translation: Google Translate Free Web API + MyMemory Fallback
 */
export const getTransStream = async (
  text: string,
  from: string,
  to: string,
  onMessage: (result: { text?: string; done?: boolean }) => void
): Promise<string> => {
  const sl = normalizeLangCode(from);
  const tl = normalizeLangCode(to || "zh-TW");

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(
      sl
    )}&tl=${encodeURIComponent(tl)}&dt=t&q=${encodeURIComponent(text)}`;

    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      let translated = "";
      if (Array.isArray(data) && Array.isArray(data[0])) {
        for (let segment of data[0]) {
          if (segment && segment[0]) {
            translated += segment[0];
          }
        }
      }
      if (translated) {
        onMessage({ text: translated, done: false });
        onMessage({ done: true });
        return translated;
      }
    }
  } catch (e) {
    console.warn("Google Translate free endpoint failed, trying MyMemory fallback...", e);
  }

  // Fallback: MyMemory API
  try {
    const fallbackUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
      text
    )}&langpair=${encodeURIComponent(sl === "auto" ? "en" : sl)}|${encodeURIComponent(tl)}`;
    const res = await fetch(fallbackUrl);
    if (res.ok) {
      const data = await res.json();
      const translated = data?.responseData?.translatedText || text;
      onMessage({ text: translated, done: false });
      onMessage({ done: true });
      return translated;
    }
  } catch (err) {
    console.error("Translation fallback failed:", err);
  }

  onMessage({ text: text, done: true });
  return text;
};

export const getBatchTrans = async (
  texts: string[],
  from: string,
  to: string
): Promise<{ code: number; data?: { texts: string[] }; msg?: string }> => {
  const sl = normalizeLangCode(from);
  const tl = normalizeLangCode(to || "zh-TW");
  const results: string[] = [];

  for (const text of texts) {
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(
        sl
      )}&tl=${encodeURIComponent(tl)}&dt=t&q=${encodeURIComponent(text)}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        let translated = "";
        if (Array.isArray(data) && Array.isArray(data[0])) {
          for (let segment of data[0]) {
            if (segment && segment[0]) translated += segment[0];
          }
        }
        results.push(translated || text);
        continue;
      }
    } catch (e) {}
    results.push(text);
  }

  return { code: 200, data: { texts: results } };
};

/**
 * 2. Online Dictionary: Free Dictionary API + Wiktionary/Google Dict Fallback
 */
export const getDictionary = async (
  word: string,
  from: string,
  to: string
): Promise<{ code: number; data?: any[]; msg?: string }> => {
  const cleanWord = (word || "").toLowerCase().trim();
  if (!cleanWord) return { code: 400, msg: "Empty word" };

  // Try Free Dictionary API (rich definitions, pronunciations & mp3)
  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(cleanWord)}`
    );
    if (res.ok) {
      const entries = await res.json();
      if (Array.isArray(entries) && entries.length > 0) {
        const entry = entries[0];
        let pronunciation = entry.phonetic || "";
        let audio = "";

        if (Array.isArray(entry.phonetics)) {
          for (let p of entry.phonetics) {
            if (p.text && !pronunciation) pronunciation = p.text;
            if (p.audio && !audio) audio = p.audio;
          }
        }

        const meanings: any[] = [];
        if (Array.isArray(entry.meanings)) {
          for (let m of entry.meanings) {
            const defs = Array.isArray(m.definitions) ? m.definitions : [];
            meanings.push({
              type: m.partOfSpeech || "",
              definition: defs.map((d: any) => d.definition).join("; "),
              examples: defs
                .filter((d: any) => d.example)
                .map((d: any) => ({
                  sentence: d.example,
                  translation: "",
                })),
            });
          }
        }

        return {
          code: 200,
          data: [
            {
              pronunciation,
              audio,
              form: [],
              meaning: meanings,
              comparison: [],
            },
          ],
        };
      }
    }
  } catch (e) {
    console.warn("Free Dictionary API fetch failed, trying translation fallback...", e);
  }

  // Fallback: Google Translate Dictionary lookup
  try {
    const sl = normalizeLangCode(from || "en");
    const tl = normalizeLangCode(to || "zh-TW");
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&dt=bd&dt=rm&q=${encodeURIComponent(
      cleanWord
    )}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      let translation = "";
      if (Array.isArray(data) && Array.isArray(data[0])) {
        translation = data[0].map((item: any) => item[0]).join("");
      }

      const meanings: any[] = [];
      // If dictionary entries exist in data[1]
      if (Array.isArray(data[1])) {
        for (let entry of data[1]) {
          const pos = entry[0]; // part of speech
          const terms = Array.isArray(entry[1]) ? entry[1].join(", ") : "";
          meanings.push({
            type: pos,
            definition: terms,
            examples: [],
          });
        }
      }

      if (meanings.length === 0 && translation) {
        meanings.push({
          type: "Translation",
          definition: translation,
          examples: [],
        });
      }

      return {
        code: 200,
        data: [
          {
            pronunciation: data[0]?.[1]?.[3] || "",
            audio: "",
            form: [],
            meaning: meanings,
            comparison: [],
          },
        ],
      };
    }
  } catch (e) {
    console.error("Dictionary lookup failed:", e);
  }

  return { code: 404, msg: "Word not found" };
};

export const getDictionaryStream = async (
  word: string,
  from: string,
  to: string,
  sentence: string,
  isFullAnalysis: boolean,
  onMessage: (result: { text?: string; done?: boolean }) => void
): Promise<{ done: boolean }> => {
  const dictText = await getDictText(word, from, to);
  if (dictText) {
    onMessage({ text: dictText, done: false });
  } else {
    onMessage({ text: `<p>${i18n.t("Word not found")}</p>`, done: false });
  }
  onMessage({ done: true });
  return { done: true };
};

export const getDictText = async (word: string, from: string, to: string): Promise<string> => {
  const res = await getDictionary(word, from, to);
  if (res.code === 200 && res.data && res.data.length > 0) {
    const item = res.data[0];
    let html = "";
    if (item.pronunciation) {
      html += `<p class="dict-word-type">[${i18n.t("Pronunciations")}] ${item.pronunciation}</p>`;
    }
    if (item.audio) {
      html += `<div class="audio-container"><audio controls preload="auto" class="audio-player" controlsList="nodownload noplaybackrate"><source src="${item.audio}" type="audio/mpeg"></audio></div>`;
    }
    if (Array.isArray(item.meaning)) {
      for (let m of item.meaning) {
        html += `<div style="margin-bottom: 8px;">`;
        if (m.type) html += `<span class="dict-word-type" style="font-weight:bold;">[${m.type}] </span>`;
        html += `<span>${m.definition}</span>`;
        if (Array.isArray(m.examples) && m.examples.length > 0) {
          for (let ex of m.examples) {
            html += `<div style="font-size: 12px; color: #666; margin-left: 12px;">• ${ex.sentence}</div>`;
          }
        }
        html += `</div>`;
      }
    }
    return html;
  }
  return "";
};

/**
 * 3. Book Metadata: Open Library + Google Books Multi-Source Search
 */
export const getBookMetadata = async (
  name: string,
  author?: string
): Promise<{ code: number; data?: any[]; msg?: string }> => {
  if (!name && !author) return { code: 400, msg: "Book title or author is required" };

  const results: any[] = [];
  const cleanName = (name || "").trim();
  const cleanAuthor = (author || "").trim();

  // 1. Query Open Library (Open, Fast, No Rate Limit)
  try {
    const q = cleanAuthor ? `title=${encodeURIComponent(cleanName)}&author=${encodeURIComponent(cleanAuthor)}` : `q=${encodeURIComponent(cleanName)}`;
    const res = await fetch(`https://openlibrary.org/search.json?${q}&limit=6`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.docs) && data.docs.length > 0) {
        for (let doc of data.docs) {
          const cover = doc.cover_i
            ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`
            : "";
          results.push({
            key: doc.key || String(Math.random()),
            name: doc.title || cleanName,
            author: Array.isArray(doc.author_name)
              ? doc.author_name.join(", ")
              : doc.author_name || cleanAuthor || "",
            publisher: Array.isArray(doc.publisher) ? doc.publisher[0] : "",
            description: doc.first_sentence ? doc.first_sentence.value || doc.first_sentence : "",
            cover,
            source: "cloud",
          });
        }
      }
    }
  } catch (err) {
    console.warn("Open Library metadata fetch failed:", err);
  }

  // 2. Query Google Books as supplementary source
  if (results.length < 3) {
    try {
      const queryParts: string[] = [];
      if (cleanName) queryParts.push(`intitle:${encodeURIComponent(cleanName)}`);
      if (cleanAuthor) queryParts.push(`inauthor:${encodeURIComponent(cleanAuthor)}`);
      const query = queryParts.join("+") || encodeURIComponent(cleanName || cleanAuthor);

      const res = await fetch(
        `https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=4`
      );
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.items) && data.items.length > 0) {
          for (let item of data.items) {
            const info = item.volumeInfo || {};
            let cover =
              info.imageLinks?.extraLarge ||
              info.imageLinks?.large ||
              info.imageLinks?.medium ||
              info.imageLinks?.thumbnail ||
              "";
            if (cover.startsWith("http://")) cover = cover.replace("http://", "https://");

            // Avoid duplicate by title
            if (!results.some(r => r.name.toLowerCase() === (info.title || "").toLowerCase())) {
              results.push({
                key: item.id || String(Math.random()),
                name: info.title || cleanName,
                author: Array.isArray(info.authors)
                  ? info.authors.join(", ")
                  : info.authors || cleanAuthor || "",
                publisher: info.publisher || "",
                description: info.description || "",
                cover,
                source: "cloud",
              });
            }
          }
        }
      }
    } catch (e) {
      console.warn("Google Books query failed:", e);
    }
  }

  return { code: 200, data: results };
};

/**
 * 4. Text-To-Speech & NLP Helpers
 */
export const getTTSAudio = async (
  text: string,
  language: string,
  voice: string,
  speed: number,
  pitch: number,
  isFirst: boolean
): Promise<{ code: number; data?: any }> => {
  // Use native Web Speech API directly with unlimited quota
  return {
    code: 200,
    data: {
      useNativeTTS: true,
    },
  };
};

export const getAnswerStream = async (
  text: string,
  question: string,
  history: any[],
  mode: string,
  onMessage: (result: any) => void
): Promise<{ data: any; done: boolean }> => {
  const msg = i18n.t(
    "Please configure your custom AI API key in Settings to chat with books."
  );
  onMessage({ text: msg, done: false });
  onMessage({ done: true });
  return { data: msg, done: true };
};

export const getOcrResult = async (imageBase64: string): Promise<{ code: number; msg: string }> => {
  return { code: 200, msg: "OCR service is not active" };
};

export const getOcrResultV2 = async (file: any): Promise<{ code: number; msg: string }> => {
  return { code: 200, msg: "OCR service is not active" };
};

export const getWordDefinitions = async (
  texts: string[],
  level: string,
  lang: string
): Promise<{ code: number; data: { results: any[] } }> => {
  return { code: 200, data: { results: [] } };
};

export const getSplitSentence = async (
  texts: { text: string; index: number }[]
): Promise<{ code: number; data: { sentences: any[] } }> => {
  return {
    code: 200,
    data: {
      sentences: (texts || []).map((item) => ({
        role: "narrator",
        text: item.text,
        index: item.index,
      })),
    },
  };
};

export const detectLanguage = async (text: string): Promise<{ code: number; data: { language: string } }> => {
  return { code: 200, data: { language: "auto" } };
};

export const resetReaderRequest = (): void => {
  // No-op for self-hosted setup
};
