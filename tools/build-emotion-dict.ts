// Builds assets/vendor/emotion_dict.json from the ML-Ask emotion lists of
// pymlask (New BSD License; attribution in static/legal/THIRD_PARTY_NOTICES.md).
// Each entry is tokenized with the bundled kuromoji and its dictionary, the
// same ones the NLP worker uses, and stored as its lemma sequence:
// { maxN, dict: { "lemma lemma": [category, ...] } }.
//
//   mise run vendor:emotion <pymlask>/mlask/emotions
//
// The committed file is reproduced byte for byte from pymlask commit
// fc796a2f2306088c74130d2db5690d86efbf8e68 (checked 2026-11-24).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type Token = { surface_form: string; basic_form?: string };
type Tokenizer = { tokenize(text: string): Token[] };

const source = process.argv[2];
if (!source) {
  console.error("usage: mise run vendor:emotion <pymlask>/mlask/emotions");
  process.exit(1);
}
const root = join(import.meta.dir, "..");
const output = join(root, "assets", "vendor", "emotion_dict.json");
const categories = ["aware", "haji", "ikari", "iya", "kowa", "odoroki", "suki", "takaburi", "yasu", "yorokobi"];

// assets/vendor/kuromoji.js is the browser build, which loads its dictionary
// with XMLHttpRequest. This stand-in reads the requested path from disk.
class FileRequest {
  status = 0;
  statusText = "";
  response: ArrayBuffer | null = null;
  onload: (() => void) | null = null;
  onerror: ((error: unknown) => void) | null = null;
  private path = "";
  responseType = "";
  open(_method: string, path: string): void {
    this.path = path;
  }
  send(): void {
    try {
      const bytes = readFileSync(this.path);
      this.response = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      this.status = 200;
      this.onload?.call(this);
    } catch (error) {
      this.onerror?.(error);
    }
  }
}
Object.assign(globalThis, { XMLHttpRequest: FileRequest });
const kuromoji = require("../assets/vendor/kuromoji.js") as {
  builder(options: { dicPath: string }): { build(done: (error: unknown, tokenizer: Tokenizer) => void): void };
};

const tokenizer = await new Promise<Tokenizer>((resolve, reject) =>
  kuromoji.builder({ dicPath: join(root, "static", "vendor", "dict") + "/" })
    .build((error, built) => error ? reject(error) : resolve(built))
);
const lemmas = (text: string) =>
  tokenizer.tokenize(text).map(token =>
    token.basic_form && token.basic_form !== "*" ? token.basic_form : token.surface_form
  ).join(" ");

const map = new Map<string, Set<string>>();
let maxN = 1;
let total = 0;
for (const category of categories) {
  const lines = readFileSync(join(source, `${category}_uncoded.txt`), "utf8")
    .split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  for (const line of lines) {
    const key = lemmas(line);
    if (!key) continue;
    maxN = Math.max(maxN, key.split(" ").length);
    if (!map.has(key)) map.set(key, new Set());
    map.get(key)?.add(category);
    total++;
  }
}
const dict = Object.fromEntries([...map].map(([key, found]) => [key, [...found]]));
writeFileSync(output, JSON.stringify({ maxN, dict }), "utf8");
console.log(`wrote assets/vendor/emotion_dict.json: ${map.size} keys from ${total} entries, maxN=${maxN}`);
