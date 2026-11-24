import { type NormalizedTweet, normalizeTweet, WEEKDAYS } from "./parse";

export interface CountOptions {
  following?: number;
  follower?: number;
  block?: number;
  mute?: number;
  like?: number;
  grok?: number;
}

export interface AnalysisOptions {
  account?: { username?: string; accountDisplayName?: string; createdAt?: string };
  counts?: CountOptions;
  personalization?: unknown[];
}

export interface RankedItem {
  name: string;
  count: number;
}

type Counter = Map<string, number>;
type UnknownRecord = Record<string, unknown>;

function increment(counter: Counter, key: string, amount = 1): void {
  counter.set(key, (counter.get(key) ?? 0) + amount);
}

function counterTop(counter: Counter, limit: number): RankedItem[] {
  return [...counter.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

function truncate(value: string, limit: number): string {
  const singleLine = value.replace(/\n/g, " ");
  return singleLine.length <= limit ? singleLine : `${singleLine.slice(0, limit - 1)}...`;
}

function record(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function findKey(value: unknown, key: string): unknown {
  if (value === null || typeof value !== "object") return null;
  if (!Array.isArray(value) && key in value) return record(value)[key];
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    const found = findKey(child, key);
    if (found !== null) return found;
  }
  return null;
}

function cleanForMatch(text: string): string {
  if (text.startsWith("RT @")) return "";
  return text.replace(/https?:\/\/\S+/g, " ").replace(/[@＠]\w+/g, " ").replace(/[#＃]\S+/g, " ");
}

export function buildOverview(tweets: NormalizedTweet[], options: AnalysisOptions): Record<string, string | number> {
  const account = options.account ?? {};
  const original = tweets.filter((tweet) => !tweet.is_retweet && !tweet.is_reply);
  const dates = tweets.map((tweet) => tweet.date);
  const favorites = original.reduce((sum, tweet) => sum + tweet.favorite_count, 0);
  const counts = options.counts ?? {};
  return {
    username: account.username ?? "",
    display_name: account.accountDisplayName ?? "",
    created_at: (account.createdAt ?? "").slice(0, 10),
    n_total: tweets.length,
    n_original: original.length,
    n_reply: tweets.filter((tweet) => tweet.is_reply).length,
    n_retweet: tweets.filter((tweet) => tweet.is_retweet).length,
    n_media: tweets.filter((tweet) => tweet.has_media).length,
    n_sensitive: tweets.filter((tweet) => tweet.possibly_sensitive).length,
    first_post: dates.reduce((earliest, date) => earliest < date ? earliest : date, ""),
    last_post: dates.reduce((latest, date) => latest > date ? latest : date, ""),
    active_days: new Set(dates).size,
    avg_per_day: Math.round(tweets.length / Math.max(new Set(dates).size, 1) * 100) / 100,
    avg_favorite: Math.round((original.length ? favorites / original.length : 0) * 100) / 100,
    n_following: counts.following ?? 0,
    n_follower: counts.follower ?? 0,
    n_block: counts.block ?? 0,
    n_mute: counts.mute ?? 0,
    n_like: counts.like ?? 0,
    n_grok_chat: counts.grok ?? 0,
  };
}

export function buildTime(tweets: NormalizedTweet[]): Record<string, unknown> {
  const byMonth = new Map<string, number>();
  const byYear = new Map<number, number>();
  const byHour = Array<number>(24).fill(0);
  const byWeekday = Array<number>(7).fill(0);
  const heat = new Map<string, number>();
  for (const tweet of tweets) {
    increment(byMonth, tweet.month);
    byYear.set(tweet.year, (byYear.get(tweet.year) ?? 0) + 1);
    byHour[tweet.hour] += 1;
    byWeekday[tweet.weekday] += 1;
    increment(heat, `${tweet.weekday},${tweet.hour}`);
  }
  const heatmap: Array<[number, number, number]> = [];
  for (let weekday = 0; weekday < 7; weekday += 1) {
    for (let hour = 0; hour < 24; hour += 1) heatmap.push([hour, weekday, heat.get(`${weekday},${hour}`) ?? 0]);
  }
  let sleep = { sum: Infinity, len: 0, start: 0 };
  for (let length = 4; length < 10; length += 1) {
    for (let start = 0; start < 24; start += 1) {
      let sum = 0;
      for (let offset = 0; offset < length; offset += 1) sum += byHour[(start + offset) % 24];
      if (sum < sleep.sum || (sum === sleep.sum && length > sleep.len)) sleep = { sum, len: length, start };
    }
  }
  return {
    by_month: [...byMonth.entries()].sort().map(([month, count]) => ({ month, count })),
    by_year: [...byYear.entries()].sort((left, right) => left[0] - right[0]).map(([year, count]) => ({ year, count })),
    by_hour: byHour,
    by_weekday: byWeekday.map((count, index) => ({ day: WEEKDAYS[index], count })),
    heatmap,
    sleep: { start: sleep.start, end: (sleep.start + sleep.len) % 24, posts_in_window: sleep.sum },
    peak_hour: byHour.indexOf(Math.max(...byHour)),
  };
}

export function buildBehavior(tweets: NormalizedTweet[]): Record<string, unknown> {
  const sources = new Map<string, number>();
  const mediaTypes = new Map<string, number>();
  const original = tweets.filter((tweet) => !tweet.is_retweet);
  for (const tweet of tweets) {
    increment(sources, tweet.source);
    for (const mediaType of tweet.media_types) increment(mediaTypes, mediaType);
  }
  const buckets: Record<string, number> = { "0": 0, "1-4": 0, "5-19": 0, "20-99": 0, "100+": 0 };
  for (const tweet of original) {
    if (tweet.favorite_count === 0) buckets["0"] += 1;
    else if (tweet.favorite_count <= 4) buckets["1-4"] += 1;
    else if (tweet.favorite_count <= 19) buckets["5-19"] += 1;
    else if (tweet.favorite_count <= 99) buckets["20-99"] += 1;
    else buckets["100+"] += 1;
  }
  return {
    sources: counterTop(sources, 50),
    top_posts: [...original].sort((left, right) => right.favorite_count - left.favorite_count).slice(0, 15)
      .map((tweet) => ({
        text: truncate(tweet.full_text, 90),
        date: tweet.date,
        fav: tweet.favorite_count,
        rt: tweet.retweet_count,
      })),
    fav_buckets: buckets,
    media_types: [...mediaTypes.entries()].map(([name, count]) => ({ name, count })),
  };
}

export function buildLinks(tweets: NormalizedTweet[]): Record<string, RankedItem[]> {
  const domains = new Map<string, number>();
  const hashtags = new Map<string, number>();
  const mentions = new Map<string, number>();
  for (const tweet of tweets) {
    for (const domain of tweet.domains) increment(domains, domain);
    for (const hashtag of tweet.hashtags) increment(hashtags, hashtag);
    if (!tweet.is_retweet) { for (const mention of tweet.mentions) increment(mentions, mention); }
  }
  for (const domain of ["t.co", "twitter.com", "x.com", "mobile.twitter.com"]) domains.delete(domain);
  return { domains: counterTop(domains, 30), hashtags: counterTop(hashtags, 30), mentions: counterTop(mentions, 30) };
}

export function buildPersona(tweets: NormalizedTweet[], personalization: unknown[]): Record<string, unknown> | null {
  const p13n = record(record(personalization[0]).p13nData);
  if (!Object.keys(p13n).length) return null;
  const demographics = record(findKey(p13n, "demographics"));
  const gender = String(record(findKey(demographics, "genderInfo")).gender ?? "?");
  const languages = (findKey(demographics, "languages") as unknown[] ?? []).map((item) =>
    String(record(item).language ?? "")
  );
  const location = findKey(p13n, "locationHistory") as unknown[] ?? [];
  const inferredAge = findKey(p13n, "inferredAgeInfo");
  const age = Array.isArray(record(inferredAge).age) ? record(inferredAge).age as unknown[] : [];
  const interestValue = findKey(p13n, "interests");
  const interests = Array.isArray(interestValue) ? interestValue : (record(interestValue).interests as unknown[] ?? []);
  const names = [
    ...new Set(interests.filter((item) => !record(item).isDisabled).map((item) => String(record(item).name ?? ""))),
  ].sort();
  const shows = (findKey(p13n, "shows") as unknown[] ?? []).map((item) =>
    typeof item === "string" ? item : String(record(item).name ?? "")
  );
  const advertisers = findKey(p13n, "advertisers") as unknown[] ?? [];
  const blob = tweets.map((tweet) => cleanForMatch(tweet.full_text).toLowerCase()).join("\n");
  const verified: RankedItem[] = [];
  const unmentioned: string[] = [];
  for (const name of names) {
    if (name.length < 3) continue;
    const lowered = name.toLowerCase();
    let count = 0;
    let index = 0;
    while ((index = blob.indexOf(lowered, index)) !== -1) {
      count += 1;
      index += lowered.length;
    }
    if (count) verified.push({ name, count });
    else unmentioned.push(name);
  }
  verified.sort((left, right) => right.count - left.count);
  return {
    gender,
    languages,
    location,
    inferred_age: age,
    n_interests: names.length,
    interests: names,
    n_shows: shows.length,
    shows: shows.slice(0, 200),
    n_advertisers: advertisers.length,
    num_audiences: findKey(p13n, "numAudiences"),
    verified_interests: verified.slice(0, 60),
    n_verified: verified.length,
    n_unmentioned: unmentioned.length,
    unmentioned_sample: unmentioned.slice(0, 60),
  };
}

export function buildAnalysis(rawTweets: unknown[], options: AnalysisOptions = {}): Record<string, unknown> {
  const tweets = rawTweets.map(normalizeTweet).filter((tweet): tweet is NormalizedTweet => tweet !== null);
  return {
    overview: buildOverview(tweets, options),
    time: buildTime(tweets),
    behavior: buildBehavior(tweets),
    links: buildLinks(tweets),
    text: null,
    psyche: { ok: false },
    persona: options.personalization ? buildPersona(tweets, options.personalization) : null,
    _tweets: tweets,
  };
}
