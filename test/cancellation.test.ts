import assert from "node:assert/strict";
import test from "node:test";
import { runArchiveFiles } from "../assets/app/ui";

test("closing the loader while reading a ZIP suppresses a late read error", async () => {
  const states: string[] = [];
  const status = {
    dataset: {},
    set textContent(state: string) {
      states.push(state);
    },
  };
  const document = { querySelector: (selector: string) => selector === "#app-status" ? status : null };
  let release: () => void = () => {};
  const reading = Promise.withResolvers<void>();
  const file = new File(["0".repeat(30)], "synthetic.zip");
  file.slice = () => {
    const blob = new Blob();
    blob.arrayBuffer = () =>
      new Promise((_, reject) => {
        release = () => reject(new Error("late read failure"));
        reading.resolve();
      });
    return blob;
  };
  const controller = new AbortController();
  const result = runArchiveFiles(document as unknown as Document, [file], "", controller.signal);
  await reading.promise;
  controller.abort();
  release();
  await result;
  assert.deepEqual(states, ["read"]);
});
