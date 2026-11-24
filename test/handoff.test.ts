import assert from "node:assert/strict";
import test from "node:test";
import { representative } from "../assets/app/handoff";
import { normalizeTweet } from "../assets/app/parse";

test("representative includes every post in a small year outside the top 80", () => {
  const posts = Array.from({ length: 90 }, (_, index) =>
    normalizeTweet({
      id_str: String(index),
      full_text: `sample post ${index}`,
      created_at: `Tue Nov 17 10:00:00 +0000 ${index < 80 ? 2020 : 2021}`,
      favorite_count: index < 80 ? 10 : 0,
    })).filter(post => post !== null);
  const markdown = representative(posts, "fixture");
  assert.equal(markdown.split("\n").filter(line => line.startsWith("[")).length, 90);
});
