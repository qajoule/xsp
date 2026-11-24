import assert from "node:assert/strict";
import test from "node:test";

import { accumulate, cleanText, type Token, type Tokenizer } from "../assets/app/nlp";

const TOKENS: Record<string, Token[]> = {
  first: [
    { pos: "名詞", pos_detail_1: "固有名詞", surface_form: "東京" },
    { pos: "名詞", pos_detail_1: "一般", surface_form: "解析" },
    { pos: "形容詞", pos_detail_1: "自立", surface_form: "楽しい", basic_form: "楽しい" },
    { pos: "感動詞", pos_detail_1: "*", surface_form: "こんにちは" },
    { pos: "名詞", pos_detail_1: "一般", surface_form: "私" },
    { pos: "名詞", pos_detail_1: "一般", surface_form: "皆さん" },
    { pos: "助動詞", pos_detail_1: "*", surface_form: "ない", basic_form: "ない" },
    { pos: "名詞", pos_detail_1: "一般", surface_form: "嬉しい" },
  ],
  second: [
    { pos: "名詞", pos_detail_1: "固有名詞", surface_form: "大阪" },
    { pos: "名詞", pos_detail_1: "一般", surface_form: "開発" },
    { pos: "動詞", pos_detail_1: "自立", surface_form: "作る", basic_form: "作る" },
    { pos: "名詞", pos_detail_1: "一般", surface_form: "悲しい" },
  ],
};

const tokenizer: Tokenizer = {
  tokenize(text) {
    if (text.includes("first")) return TOKENS.first;
    if (text.includes("second")) return TOKENS.second;
    return [];
  },
};

test("cleanText removes retweets, links, mentions, and hashtags", () => {
  assert.equal(cleanText("RT @person copied"), "");
  const cleaned = cleanText("text https://example.test @person #topic");
  assert.equal(cleaned.includes("https://"), false);
  assert.equal(cleaned.includes("@person"), false);
  assert.equal(cleaned.includes("#topic"), false);
});

test("accumulate exposes every report field used by the text and psyche sections", async () => {
  const result = await accumulate(tokenizer, {
    maxN: 1,
    dict: { "嬉しい": ["yorokobi"], "悲しい": ["aware"] },
  }, [
    { year: 2025, source: "Web", full_text: "first 絶対かも 😀" },
    { year: 2026, source: "Web", full_text: "second たぶん 😄" },
    { year: 2026, source: "Web", full_text: "RT @person ignored 🥳" },
  ]);

  const text = result.text as Record<string, Array<[string, number]> | number>;
  const psyche = result.psyche as Record<string, unknown>;
  assert.equal(text.analyzed_count, 2);
  assert.deepEqual(text.propers, [["東京", 1], ["大阪", 1]]);
  assert.deepEqual(text.nouns, [["解析", 1], ["皆さん", 1], ["嬉しい", 1], ["開発", 1], ["悲しい", 1]]);
  assert.deepEqual(text.verbs, [["作る", 1]]);
  assert.deepEqual(text.adjs, [["楽しい", 1]]);
  assert.deepEqual(text.interjections, [["こんにちは", 1]]);
  assert.deepEqual(text.emojis, [["😀", 1], ["😄", 1], ["🥳", 1]]);
  assert.deepEqual(psyche.fp_breakdown, [{ name: "私", count: 1 }]);
  assert.equal(psyche.social_total, 1);
  assert.equal(psyche.negation_total, 1);
  assert.deepEqual(psyche.emotion_totals, [["喜", 1], ["哀", 1]].map(([name, count]) => ({ name, count })));
  assert.deepEqual(psyche.by_year, [
    { year: 2025, assertive_ratio: 0.5, neg_rate: 76.923, pos: 1, neg_emo: 0 },
    { year: 2026, assertive_ratio: 0, neg_rate: 0, pos: 0, neg_emo: 1 },
  ]);
});
