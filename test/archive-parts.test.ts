import assert from "node:assert/strict";
import test from "node:test";
import { textsFromArchiveFiles } from "../assets/app/archive-input";
import { parseYTD } from "../assets/app/parse";
import { extractZipWithFallback } from "../assets/app/zip";
import * as fflate from "../assets/vendor/fflate.min.js";

const parts = ["like-part10", "tweets-part10", "tweets-part2", "tweets", "like"];
const files = parts.map(name =>
  new File([
    "window.YTD." + name.split("-")[0] + ".part0 = " + JSON.stringify([name]),
  ], name + ".js")
);

test("unpacked files retain all roles and order numbered parts numerically", async () => {
  const result = await textsFromArchiveFiles(files);
  assert.deepEqual(parseYTD(result.tweets), ["tweets", "tweets-part2", "tweets-part10"]);
  assert.deepEqual(parseYTD(result.like), ["like", "like-part10"]);
});

test("seek and streaming extraction agree with unpacked input", async () => {
  Object.assign(globalThis, { fflate });
  const entries = await Promise.all(files.map(async file => [file.name, fflate.strToU8(await file.text())]));
  const bytes = fflate.zipSync(Object.fromEntries(entries));
  const zip = new File([bytes], "archive.zip");
  const expected = await textsFromArchiveFiles(files);
  const seek = await extractZipWithFallback(zip);
  assert.equal(seek.path, "seek");
  assert.deepEqual(seek.textByRole, expected);
  // A missing end record selects the streaming path without changing the entries.
  const truncated = new File([bytes.slice(0, -22)], "archive.zip");
  const fallback = await extractZipWithFallback(truncated);
  assert.equal(fallback.path, "streaming");
  assert.deepEqual(fallback.textByRole, expected);
});

test("a part limit failure never retries through the streaming reader", async () => {
  Object.assign(globalThis, { fflate });
  const entries = Object.fromEntries(
    Array.from({ length: 65 }, (_, i) => ["tweets-part" + i + ".js", new Uint8Array([1])]),
  );
  const zip = new File([fflate.zipSync(entries)], "archive.zip");
  let streamed = false;
  Object.defineProperty(zip, "stream", {
    value: () => {
      streamed = true;
      throw Error("unexpected retry");
    },
  });
  await assert.rejects(extractZipWithFallback(zip), /partsPerRole/);
  assert.equal(streamed, false);
});
