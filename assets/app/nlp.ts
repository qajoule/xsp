import { automaticPostSources } from "./post-sources";
export interface NlpInputPost {
  year: number;
  source: string;
  full_text: string;
}

export interface Token {
  pos: string;
  pos_detail_1: string;
  surface_form: string;
  basic_form?: string;
}

export interface Tokenizer {
  tokenize(text: string): Token[];
}
export interface EmotionDictionary {
  maxN: number;
  dict: Record<string, string[]>;
}
export interface NlpResult {
  text: Record<string, unknown>;
  psyche: Record<string, unknown>;
}

const ENG_STOP = new Set([
  "the",
  "a",
  "an",
  "on",
  "in",
  "at",
  "of",
  "to",
  "by",
  "for",
  "with",
  "and",
  "or",
  "but",
  "is",
  "am",
  "are",
  "was",
  "were",
  "be",
  "been",
  "it",
  "its",
  "this",
  "that",
  "these",
  "those",
  "you",
  "your",
  "i",
  "my",
  "me",
  "we",
  "he",
  "she",
  "they",
  "his",
  "her",
  "as",
  "so",
  "liked",
  "like",
  "via",
  "from",
  "up",
  "out",
  "new",
  "now",
  "com",
  "www",
  "http",
  "https",
  "html",
  "just",
  "get",
  "got",
  "s",
  "t",
  "re",
]);
const STOP_NOUN = new Set([
  "の",
  "ん",
  "こと",
  "もの",
  "よう",
  "そう",
  "ため",
  "とき",
  "これ",
  "それ",
  "あれ",
  "どれ",
  "ここ",
  "そこ",
  "どこ",
  "ほう",
  "とこ",
  "みたい",
  "はず",
  "人",
  "自分",
  "気",
  "話",
  "感じ",
  "今",
  "今日",
  "明日",
  "昨日",
  "時",
  "方",
  "的",
  "さん",
  "君",
  "ちゃん",
  "笑",
  "w",
  "ｗ",
  "件",
  "度",
  "回",
  "つ",
  "個",
  "何",
  "誰",
  "私",
  "俺",
  "僕",
  "皆",
  "中",
  "上",
  "下",
  "前",
  "後",
  "一",
  "二",
  "三",
  "%",
  "円",
  "年",
  "月",
  "日",
  "時間",
  "分",
  "秒",
]);
const VERB_STOP = new Set([
  "する",
  "いる",
  "ある",
  "なる",
  "れる",
  "られる",
  "てる",
  "しまう",
  "みる",
  "くる",
  "いく",
  "やる",
  "思う",
  "言う",
  "見る",
  "行く",
  "来る",
]);
const FP: Record<string, string> = {
  "俺": "俺",
  "おれ": "俺",
  "オレ": "俺",
  "僕": "僕",
  "ぼく": "僕",
  "ボク": "僕",
  "私": "私",
  "わたし": "私",
  "わたくし": "私",
  "ワタシ": "私",
  "自分": "自分",
  "うち": "うち",
  "ウチ": "うち",
  "わし": "わし",
  "ワシ": "わし",
  "我": "我",
  "我々": "我",
  "われ": "我",
};
const FP_ORDER = ["俺", "僕", "私", "自分", "うち", "わし", "我"];
const SOCIAL = new Set([
  "みんな",
  "みな",
  "皆",
  "みなさん",
  "皆さん",
  "一緒",
  "仲間",
  "我々",
  "われわれ",
  "たち",
  "達",
]);
const POSITIVE = new Set(["yorokobi", "suki", "yasu"]);
const NEGATIVE = new Set(["iya", "ikari", "aware", "kowa", "haji"]);
const EMO_JP: Record<string, string> = {
  yorokobi: "喜",
  ikari: "怒",
  aware: "哀",
  kowa: "怖",
  haji: "恥",
  suki: "好",
  iya: "厭",
  takaburi: "昂",
  yasu: "安",
  odoroki: "驚",
};
const ASSERT = /絶対|必ず|間違いなく|に違いない|明らかに|確実|断言|当然|べき|しかない/g;
const TENT = /かも|かな|だろう|でしょう|たぶん|多分|おそらく|気がする|と思う|思う|かもしれ|らしい|みたい|ような気/g;
const EMOJI =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F0FF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}]/gu;
const EMOJI_SKIP = new Set(["️", "→", "←", "↑", "↓", "★", "☆", "︎"]);

export function cleanText(value: string): string {
  if (value.startsWith("RT @")) return "";
  return value.replace(/https?:\/\/\S+/g, " ").replace(/[@＠]\w+/g, " ").replace(/[#＃]\S+/g, " ");
}

function inc(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}
function top(map: Map<string, number>, limit: number): Array<[string, number]> {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}
function ratio(a: number, b: number): number | null {
  return b ? Math.round(a / b * 1000) / 1000 : null;
}
function categories(lemmas: string[], emotion: EmotionDictionary): string[] {
  const output: string[] = [];
  for (let index = 0; index < lemmas.length;) {
    let hit = false;
    for (let size = Math.min(emotion.maxN, lemmas.length - index); size >= 1; size -= 1) {
      const values = emotion.dict[lemmas.slice(index, index + size).join(" ")];
      if (values) {
        output.push(...values);
        index += size;
        hit = true;
        break;
      }
    }
    if (!hit) index += 1;
  }
  return output;
}

export async function accumulate(
  tokenizer: Tokenizer,
  emotion: EmotionDictionary,
  posts: NlpInputPost[],
): Promise<NlpResult> {
  const nouns = new Map<string, number>(),
    propers = new Map<string, number>(),
    verbs = new Map<string, number>(),
    adjs = new Map<string, number>(),
    interjections = new Map<string, number>(),
    emojis = new Map<string, number>(),
    fp = new Map<string, number>(),
    feelings = new Map<string, number>();
  let analyzed = 0, chars = 0, asserted = 0, tentative = 0, negated = 0, social = 0;
  const years = new Map<
    number,
    { asserted: number; tentative: number; negated: number; chars: number; positive: number; negative: number }
  >();
  for (const post of posts) {
    for (const emoji of post.full_text.match(EMOJI) ?? []) if (!EMOJI_SKIP.has(emoji)) inc(emojis, emoji);
    const text = cleanText(post.full_text);
    if (!text.trim()) continue;
    analyzed += 1;
    chars += text.length;
    const lemmas: string[] = [];
    let postNegated = 0;
    for (const token of tokenizer.tokenize(text)) {
      const lemma = token.basic_form && token.basic_form !== "*" ? token.basic_form : token.surface_form;
      lemmas.push(lemma);
      if (token.pos === "名詞") {
        const lower = token.surface_form.toLowerCase();
        if (!(ENG_STOP.has(lower) || (/^[\x00-\x7F]+$/u.test(token.surface_form) && token.surface_form.length <= 2))) {
          if (token.pos_detail_1 === "固有名詞" && token.surface_form.length >= 2) inc(propers, token.surface_form);
          if (
            (token.pos_detail_1 === "一般" || token.pos_detail_1 === "サ変接続") && !STOP_NOUN.has(token.surface_form)
            && token.surface_form.length >= 2
          ) inc(nouns, token.surface_form);
        }
      }
      if (token.pos === "動詞" && token.pos_detail_1 === "自立" && !VERB_STOP.has(lemma)) inc(verbs, lemma);
      if (token.pos === "形容詞" && token.pos_detail_1 === "自立") inc(adjs, lemma);
      if (token.pos === "感動詞") inc(interjections, token.surface_form);
      if (FP[token.surface_form]) inc(fp, FP[token.surface_form]);
      if ((token.pos === "形容詞" || token.pos === "助動詞") && (lemma === "ない" || lemma === "ぬ")) postNegated += 1;
      if (SOCIAL.has(token.surface_form)) social += 1;
    }
    const postAsserted = (text.match(ASSERT) ?? []).length;
    const postTentative = (text.match(TENT) ?? []).length;
    asserted += postAsserted;
    tentative += postTentative;
    negated += postNegated;
    const year = years.get(post.year) ?? { asserted: 0, tentative: 0, negated: 0, chars: 0, positive: 0, negative: 0 };
    year.asserted += postAsserted;
    year.tentative += postTentative;
    year.negated += postNegated;
    year.chars += text.length;
    let positive = 0, negative = 0;
    for (const category of categories(lemmas, emotion)) {
      inc(feelings, EMO_JP[category] ?? category);
      if (POSITIVE.has(category)) positive += 1;
      if (NEGATIVE.has(category)) negative += 1;
    }
    if (positive > negative) year.positive += 1;
    if (negative > positive) year.negative += 1;
    years.set(post.year, year);
  }
  return {
    text: {
      analyzed_count: analyzed,
      total_chars: chars,
      avg_chars: analyzed ? Math.round(chars / analyzed * 10) / 10 : 0,
      nouns: top(nouns, 120),
      propers: top(propers, 120),
      verbs: top(verbs, 60),
      adjs: top(adjs, 50),
      interjections: top(interjections, 40),
      emojis: top(emojis, 40),
    },
    psyche: {
      ok: true,
      fp_breakdown: FP_ORDER.filter((key) => fp.has(key)).map((name) => ({ name, count: fp.get(name) })),
      fp_total: [...fp.values()].reduce((sum, value) => sum + value, 0),
      social_total: social,
      assertive_total: asserted,
      tentative_total: tentative,
      assertive_ratio: ratio(asserted, asserted + tentative),
      negation_total: negated,
      neg_rate: ratio(negated * 1000, chars),
      emotion_totals: top(feelings, 10).map(([name, count]) => ({ name, count })),
      by_year: [...years.entries()].sort(([a], [b]) => a - b).map(([year, value]) => ({
        year,
        assertive_ratio: ratio(value.asserted, value.asserted + value.tentative),
        neg_rate: ratio(value.negated * 1000, value.chars),
        pos: value.positive,
        neg_emo: value.negative,
      })),
    },
  };
}

export async function enrich(
  data: { _tweets: NlpInputPost[]; text: unknown; psyche: unknown },
  injected: { tokenizer: Tokenizer; emo: EmotionDictionary },
): Promise<void> {
  const result = await accumulate(
    injected.tokenizer,
    injected.emo,
    data._tweets.filter((post) => !automaticPostSources.has(post.source)),
  );
  data.text = result.text;
  data.psyche = result.psyche;
}
