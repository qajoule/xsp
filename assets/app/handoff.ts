import type { AnalysisData } from "./app";
import { CONTENT } from "./content";
import { T } from "./i18n";
import type { NormalizedTweet } from "./parse";
import { automaticPostSources } from "./post-sources";

const clean = (value: string): string => value.replace(/\s+/g, " ").trim();
const dateTime = (value: string): string => value.slice(0, 16).replace("T", " ");

export function ownPosts(data: { _tweets: NormalizedTweet[] }): NormalizedTweet[] {
  return data._tweets.filter((post) =>
    !post.is_retweet && !automaticPostSources.has(post.source) && clean(post.full_text)
  ).sort((
    a,
    b,
  ) => a.created_at < b.created_at ? -1 : 1);
}

export function corpusByYear(posts: NormalizedTweet[], username: string): Record<string, string> {
  const years = new Map<number, NormalizedTweet[]>();
  for (const post of posts) {
    const bucket = years.get(post.year) ?? [];
    bucket.push(post);
    years.set(post.year, bucket);
  }
  const output: Record<string, string> = {};
  for (const [year, bucket] of [...years.entries()].sort((a, b) => a[0] - b[0])) {
    output[`corpus_${year}.md`] = [
      `# ${year}年の投稿（@${username} / 本人の発言のみ）`,
      "",
      ...bucket.map((post) =>
        `[${dateTime(post.created_at)}]${post.is_reply ? "（返信）" : ""} ${clean(post.full_text)}`
      ),
    ].join("\n");
  }
  return output;
}

function random(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

export function representative(posts: NormalizedTweet[], username: string): string {
  const top = [...posts].sort((a, b) => b.favorite_count - a.favorite_count).slice(0, 80),
    byYear = new Map<number, NormalizedTweet[]>(),
    sampled: NormalizedTweet[] = [],
    rng = random(42);
  for (const post of posts) {
    const bucket = byYear.get(post.year) ?? [];
    bucket.push(post);
    byYear.set(post.year, bucket);
  }
  for (const [, source] of [...byYear.entries()].sort((a, b) => a[0] - b[0])) {
    const pool = [...source];
    const sampleSize = Math.min(25, pool.length);
    for (let i = 0; i < sampleSize; i += 1) {
      sampled.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    }
  }
  const seen = new Set<string | number | undefined>(),
    picked = [...top, ...sampled].sort((a, b) => a.created_at < b.created_at ? -1 : 1).filter((post) =>
      !seen.has(post.id) && (seen.add(post.id), true)
    );
  return [
    `# 代表的な投稿の抜粋（@${username}）`,
    `最も反応された80件＋各年からの無作為抽出。全${picked.length}件。本人の発言のみ（RT・自動投稿・DMを除外）。`,
    "",
    ...picked.map((post) => `[${post.date} ♥${post.favorite_count}] ${clean(post.full_text)}`),
  ].join("\n");
}

type Content = Record<string, unknown>;
type Fflate = {
  strToU8(value: string): Uint8Array;
  zipSync(files: Record<string, Uint8Array>, options?: { level: number }): Uint8Array;
};

function record(value: unknown): Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}
function content(): Content {
  return CONTENT;
}
function prompt(): string {
  const value = content().prompt;
  return typeof value === "string" ? value : "";
}
function formattedTop(value: unknown, limit: number): string {
  return (Array.isArray(value) ? value : []).slice(0, limit).map((item) =>
    Array.isArray(item) ? `${item[0]}(${item[1]})` : `${record(item).name}(${record(item).count})`
  ).join("、");
}

export function briefText(data: AnalysisData): string {
  const root = record(data),
    overview = record(root.overview),
    behavior = record(root.behavior),
    text = record(root.text),
    psyche = record(root.psyche),
    persona = root.persona === null ? null : record(root.persona),
    lines: string[] = [];
  const firstSource = Array.isArray(behavior.sources) ? record(behavior.sources[0]) : {};
  lines.push("# ローカル定量解析サマリ（LLMへの前提コンテキスト）", "");
  lines.push(
    `これは @${overview.username}（${overview.display_name}）のX投稿を機械集計した結果。人格の意味づけはあなた（LLM）に委ね、以下の定量事実を根拠の裏づけに使うこと。`,
    "",
  );
  lines.push("## 基本");
  lines.push(
    `- 期間: ${overview.first_post} 〜 ${overview.last_post}（投稿 ${
      Number(overview.n_total ?? 0).toLocaleString()
    }／通常 ${Number(overview.n_original ?? 0).toLocaleString()}・返信 ${
      Number(overview.n_reply ?? 0).toLocaleString()
    }・RT ${Number(overview.n_retweet ?? 0).toLocaleString()}）`,
  );
  lines.push(
    `- 投稿端末: ${
      firstSource.name ?? "?"
    }中心。平均いいね ${overview.avg_favorite}。フォロー ${overview.n_following}／フォロワー ${overview.n_follower}`,
    "",
  );
  if (Object.keys(text).length > 0) {
    lines.push(`## 言葉（形態素解析・${Number(text.analyzed_count ?? 0).toLocaleString()}投稿）`);
    lines.push(`- よく出る固有名詞: ${formattedTop(text.propers, 25)}`);
    lines.push(`- よく出る一般名詞: ${formattedTop(text.nouns, 25)}`);
    lines.push(`- よく使う動詞: ${formattedTop(text.verbs, 15)}`);
    lines.push(`- よく使う形容詞: ${formattedTop(text.adjs, 15)}`);
    lines.push(`- 口癖（感動詞）: ${formattedTop(text.interjections, 12)}`, "");
  }
  if (psyche.ok === true) {
    lines.push("## 無意識の言語指標（機能語）");
    lines.push(`- 一人称の内訳: ${formattedTop(psyche.fp_breakdown, 100)}`);
    lines.push(`- 断定率: ${psyche.assertive_ratio}（低い＝言い切らず推量でヘッジしがち）`);
    lines.push(`- 否定密度: ${psyche.neg_rate} /千字、社会語（みんな/一緒等）: ${psyche.social_total}`);
    lines.push(`- 感情の内訳(ML-Ask): ${formattedTop(psyche.emotion_totals, 8)}`, "");
  }
  if (persona) {
    lines.push("## Xが推定したプロファイル（広告用）");
    lines.push(
      `- 推定: ${persona.gender === "male" ? "男性" : persona.gender}／言語 ${
        (Array.isArray(persona.languages) ? persona.languages : []).join(" ")
      }／居住地 ${(Array.isArray(persona.location) ? persona.location : []).join("・")}／年齢層 ${
        (Array.isArray(persona.inferred_age) ? persona.inferred_age : []).join("・")
      }`,
    );
    lines.push(
      `- 推定興味 ${persona.n_interests}件中、本文で裏取り ${persona.n_verified}件・未言及 ${persona.n_unmentioned}件`,
    );
    lines.push(`- 実際に言及の多い興味: ${formattedTop(persona.verified_interests, 15)}`);
  }
  return lines.join("\n");
}

function download(name: string, bytes: Uint8Array): void {
  const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: "application/zip" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
async function copy(value: string, button: HTMLElement): Promise<void> {
  const copyContent = content();
  try {
    await navigator.clipboard.writeText(value);
    flash(button, typeof copyContent.copiedOk === "string" ? copyContent.copiedOk : "");
  } catch {
    flash(button, typeof copyContent.copiedFail === "string" ? copyContent.copiedFail : "");
  }
}
function flash(button: HTMLElement, value: string): void {
  const before = button.textContent;
  button.textContent = value;
  setTimeout(() => {
    button.textContent = before;
  }, 1800);
}
function element(id: string): HTMLElement {
  const value = document.getElementById(id);
  if (!value) throw new Error(`report DOM is missing #${id}`);
  return value;
}

export function initHandoff(data: AnalysisData): void {
  const posts = ownPosts({ _tweets: data._tweets as unknown as NormalizedTweet[] });
  const overview = record(data.overview),
    username = String(overview.username || "you"),
    brief = briefText(data),
    representativePosts = representative(posts, username);
  const title = element("ttl_hf1"),
    downloadButton = element("dl_zip"),
    promptButton = element("cp_prompt"),
    allButton = element("cp_all");
  const handoff = record(content().sections);
  const card1 = record(record(handoff.handoff).card1);
  title.innerHTML = T("sections.handoff.card1.title", { count: posts.length.toLocaleString() }, "html");
  downloadButton.onclick = () => {
    const fflate = (globalThis as typeof globalThis & { fflate?: Fflate }).fflate;
    if (!fflate) throw new Error("ZIP dependency is missing");
    const files = { "00_analysis_brief.md": brief, ...corpusByYear(posts, username) };
    const bytes = fflate.zipSync(
      Object.fromEntries(Object.entries(files).map(([name, value]) => [name, fflate.strToU8(value)])),
      { level: 6 },
    );
    download("x-self-profile-corpus.zip", bytes);
  };
  promptButton.onclick = () => {
    void copy(prompt(), promptButton);
  };
  allButton.onclick = () => {
    void copy(`${prompt()}\n\n---\n\n${brief}\n\n---\n\n${representativePosts}`, allButton);
  };
  if (typeof card1.title !== "string") throw new Error("handoff content contract is missing");
  element("sec_handoff").dataset.ready = "true";
}
