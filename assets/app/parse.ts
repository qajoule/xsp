export interface ParsedCreatedAt {
  iso: string;
  year: number;
  month: string;
  date: string;
  hour: number;
  weekday: number;
}

export interface NormalizedTweet {
  id: string | number | undefined;
  created_at: string;
  year: number;
  month: string;
  date: string;
  hour: number;
  weekday: number;
  full_text: string;
  text_len: number;
  lang: string;
  is_retweet: boolean;
  is_reply: boolean;
  reply_to: string;
  favorite_count: number;
  retweet_count: number;
  source: string;
  possibly_sensitive: boolean;
  n_hashtags: number;
  hashtags: string[];
  n_mentions: number;
  mentions: string[];
  n_urls: number;
  urls: string[];
  domains: string[];
  has_media: boolean;
  n_media: number;
  media_types: string[];
}

type RecordValue = Record<string, unknown>;

const ASSIGNMENT = /window\.YTD\.[A-Za-z0-9_]+\.part\d+\s*=\s*/g;
const MONTHS: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

export const WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"] as const;

function record(value: unknown): RecordValue {
  return value !== null && typeof value === "object" ? value as RecordValue : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function count(value: unknown): number {
  return Number.parseInt(String(value ?? 0), 10) || 0;
}

export function parseYTD(input: unknown): unknown[] {
  if (typeof input !== "string") throw new TypeError("YTD input must be text");
  const assignments = input.match(ASSIGNMENT);
  if (!assignments?.length) throw new Error("YTD assignment was not found");
  const output: unknown[] = [];
  const parts = input.split(ASSIGNMENT);
  for (let index = 1; index < parts.length; index += 1) {
    const source = parts[index].trim().replace(/;\s*$/, "");
    if (!source) continue;
    let value: unknown;
    try {
      value = JSON.parse(source);
    } catch {
      throw new Error(`YTD part ${index - 1} is not valid JSON`);
    }
    if (Array.isArray(value)) output.push(...value);
    else output.push(value);
  }
  return output;
}

export function parseCreatedAt(raw: unknown): ParsedCreatedAt | null {
  if (typeof raw !== "string") return null;
  const match = raw.match(/^\w+ (\w+) (\d+) (\d+):(\d+):(\d+) ([+-]\d{4}) (\d+)$/);
  if (!match) return null;
  const [, monthName, day, hour, minute, second, timezone, year] = match;
  const month = MONTHS[monthName];
  if (month === undefined) return null;
  let utc = Date.UTC(Number(year), month, Number(day), Number(hour), Number(minute), Number(second));
  const sign = timezone[0] === "-" ? 1 : -1;
  utc += sign * (Number(timezone.slice(1, 3)) * 60 + Number(timezone.slice(3, 5))) * 60_000;
  const jst = new Date(utc + 9 * 60 * 60 * 1000);
  const pad = (value: number): string => String(value).padStart(2, "0");
  const jstYear = jst.getUTCFullYear();
  const jstMonth = jst.getUTCMonth() + 1;
  const jstDay = jst.getUTCDate();
  return {
    iso: `${jstYear}-${pad(jstMonth)}-${pad(jstDay)}T${pad(jst.getUTCHours())}:${pad(jst.getUTCMinutes())}:00+09:00`,
    year: jstYear,
    month: `${jstYear}-${pad(jstMonth)}`,
    date: `${jstYear}-${pad(jstMonth)}-${pad(jstDay)}`,
    hour: jst.getUTCHours(),
    weekday: (jst.getUTCDay() + 6) % 7,
  };
}

export function sourceLabel(raw: unknown): string {
  if (!raw) return "(unknown)";
  let output = "";
  let inTag = false;
  let quote = "";
  for (const character of String(raw)) {
    if (!inTag) {
      if (character === "<") inTag = true;
      else output += character;
    } else if (quote) {
      if (character === quote) quote = "";
    } else if (character === "\"" || character === "'") quote = character;
    else if (character === ">") inTag = false;
  }
  return output.trim() || "(unknown)";
}

export function domainOf(value: unknown): string {
  if (typeof value !== "string") return "";
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return "";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname.length > 253 || !hostname.split(".").every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
  ) return "";
  return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
}

export function normalizeTweet(input: unknown): NormalizedTweet | null {
  const outer = record(input);
  const tweet = record(outer.tweet ?? input);
  const entities = record(tweet.entities);
  const extendedEntities = record(tweet.extended_entities);
  const urls = array(entities.urls).map((item) => text(record(item).expanded_url));
  const hashtags = array(entities.hashtags).map((item) => text(record(item).text));
  const mentions = array(entities.user_mentions).map((item) => text(record(item).screen_name));
  const media = array(extendedEntities.media);
  const fullText = text(tweet.full_text);
  const createdAt = parseCreatedAt(tweet.created_at);
  if (!createdAt) return null;
  return {
    id: typeof tweet.id_str === "string" || typeof tweet.id_str === "number"
      ? tweet.id_str
      : typeof tweet.id === "string" || typeof tweet.id === "number"
      ? tweet.id
      : undefined,
    created_at: createdAt.iso,
    year: createdAt.year,
    month: createdAt.month,
    date: createdAt.date,
    hour: createdAt.hour,
    weekday: createdAt.weekday,
    full_text: fullText,
    text_len: fullText.length,
    lang: text(tweet.lang),
    is_retweet: fullText.startsWith("RT @"),
    is_reply: Boolean(tweet.in_reply_to_status_id),
    reply_to: text(tweet.in_reply_to_screen_name),
    favorite_count: count(tweet.favorite_count),
    retweet_count: count(tweet.retweet_count),
    source: sourceLabel(tweet.source),
    possibly_sensitive: Boolean(tweet.possibly_sensitive),
    n_hashtags: hashtags.length,
    hashtags,
    n_mentions: mentions.length,
    mentions,
    n_urls: urls.length,
    urls,
    domains: urls.map(domainOf).filter(Boolean),
    has_media: media.length > 0,
    n_media: media.length,
    media_types: media.map((item) => text(record(item).type)),
  };
}
