import params from "@params";
import { type EmotionDictionary, enrich, type Tokenizer } from "./nlp";
import type { NlpPost } from "./nlp-client";

declare function importScripts(...urls: string[]): void;
declare const kuromoji: {
  builder(options: { dicPath: string }): { build(callback: (error: Error | null, tokenizer: Tokenizer) => void): void };
};

interface RunMessage {
  type: "run";
  id: number;
  posts: NlpPost[];
}
interface CancelMessage {
  type: "cancel";
  id: number;
}
type IncomingMessage = RunMessage | CancelMessage;

// js.html passes the fingerprinted URLs of kuromoji and the emotion
// dictionary, and the directory of the kuromoji dictionary.
const urls = params as { kuromoji: string; emotion: string; dictionary: string };

importScripts(urls.kuromoji);
const cancelled = new Set<number>();

function loadTokenizer(): Promise<Tokenizer> {
  return new Promise((resolve, reject) =>
    kuromoji.builder({ dicPath: urls.dictionary }).build((error, tokenizer) =>
      error ? reject(error) : resolve(tokenizer)
    )
  );
}

async function run(message: RunMessage): Promise<void> {
  try {
    const [tokenizer, emotion] = await Promise.all([
      loadTokenizer(),
      fetch(urls.emotion).then(async (response) => {
        if (!response.ok) throw new Error(`emotion dictionary request failed: ${response.status}`);
        return response.json() as Promise<EmotionDictionary>;
      }),
    ]);
    if (cancelled.delete(message.id)) return;
    const data = { _tweets: message.posts, text: null as unknown, psyche: null as unknown };
    await enrich(data, { tokenizer, emo: emotion });
    if (cancelled.delete(message.id)) return;
    globalThis.postMessage({ type: "result", id: message.id, result: { text: data.text, psyche: data.psyche } });
  } catch (error) {
    if (cancelled.delete(message.id)) return;
    globalThis.postMessage({
      type: "error",
      id: message.id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

globalThis.addEventListener("message", (event: MessageEvent<IncomingMessage>) => {
  if (event.data.type === "cancel") cancelled.add(event.data.id);
  else void run(event.data);
});
