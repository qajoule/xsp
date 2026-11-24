import { type AnalysisOptions, buildAnalysis } from "./analyze";
import { type NlpPost, NlpWorkerClient } from "./nlp-client";
import { parseYTD } from "./parse";

const COUNT_ROLES = ["following", "follower", "block", "mute", "like", "grok"] as const;
export type TextByRole = Partial<Record<"tweets" | "personalization" | "account" | typeof COUNT_ROLES[number], string>>;
export type AppState = "read" | "parse" | "nlp" | "render" | "error";
export type AnalysisData = Record<string, unknown> & { _tweets: NlpPost[]; text: unknown; psyche: unknown };

export function buildDataFromTexts(texts: TextByRole): Record<string, unknown> {
  if (!texts.tweets) throw new Error("tweets archive data was not found");
  const options: AnalysisOptions = { counts: {} };
  if (texts.personalization) options.personalization = parseYTD(texts.personalization);
  if (texts.account) {
    const account = parseYTD(texts.account)[0];
    if (account !== null && typeof account === "object" && "account" in account) {
      options.account = (account as { account: AnalysisOptions["account"] }).account;
    }
  }
  for (const role of COUNT_ROLES) if (texts[role]) options.counts![role] = parseYTD(texts[role]).length;
  return buildAnalysis(parseYTD(texts.tweets), options);
}

export function startAnalysisFromTexts(
  texts: TextByRole,
  workerURL: string,
  onState: (state: AppState) => void,
): { promise: Promise<AnalysisData>; cancel: () => void } {
  try {
    onState("read");
    onState("parse");
    const data = buildDataFromTexts(texts) as AnalysisData;
    onState("nlp");
    const worker = new NlpWorkerClient(workerURL).run(
      data._tweets.map((post) => ({ year: post.year, source: post.source, full_text: post.full_text })),
    );
    return {
      cancel: worker.cancel,
      promise: worker.promise.then((result) => {
        data.text = result.text;
        data.psyche = result.psyche;
        onState("render");
        return data;
      }).catch((error: unknown) => {
        onState("error");
        throw error;
      }),
    };
  } catch (error) {
    onState("error");
    return { cancel: () => {}, promise: Promise.reject(error) };
  }
}
