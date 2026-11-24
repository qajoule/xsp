// Checks the production build in dist/: the required pages, that every public
// file is expected, that nothing from an X archive slipped in, the asset
// integrity and CSP rules, the vendored files against tools/vendor.toml, and
// the URLs in the sitemap, canonical links, OGP tags, _headers, and robots.txt.
//
//   mise run check:dist
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import hugo from "../hugo.toml";
import vendor from "./vendor.toml";

type Package = { files: Record<string, { to: string; sha256: string }> };

const root = join(import.meta.dir, "..");
const dist = join(root, "dist");
const required = [
  "index.html",
  "404.html",
  "sample/index.html",
  "guide/index.html",
  "privacy/index.html",
  "sitemap.xml",
  "robots.txt",
];
const forbiddenNames = new Set([
  "tweets.js",
  "personalization.js",
  "account.js",
  "like.js",
  "following.js",
  "follower.js",
  "block.js",
  "mute.js",
  "grok-chat-item.js",
]);
const forbiddenDirectoryParts = new Set([
  "data",
  "archive",
  "archives",
  "direct-messages",
  "direct_message",
  "direct-message",
]);
const forbiddenExtensions = new Set([".zip", ".csv"]);

function list(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const absolute = join(directory, entry);
    if (statSync(absolute).isDirectory()) files.push(...list(absolute));
    else files.push(absolute);
  }
  return files;
}

if (!existsSync(dist)) throw new Error("dist is missing; run mise run build first");
for (const file of required) {
  if (!existsSync(join(dist, file))) throw new Error(`required output is missing: ${file}`);
}

const files = list(dist);
const allowed = new Set<string>([
  ...required,
  "_redirects",
  "googlef6f8e0235e04c590.html",
  "_headers",
  "favicon.svg",
  "images/ogp.png",
  "legal/LICENSE",
  "legal/THIRD_PARTY_NOTICES.md",
  "legal/licenses/Apache-2.0.txt",
  ...["echarts-LICENSE.txt", "echarts-NOTICE.txt", "LICENSE-d3", "fflate-LICENSE.txt", "kuromoji-NOTICE.md"]
    .map(name => `legal/licenses/${name}`),
  ...[
    "base",
    "cc",
    "check",
    "tid",
    "tid_map",
    "tid_pos",
    "unk",
    "unk_char",
    "unk_compat",
    "unk_invoke",
    "unk_map",
    "unk_pos",
  ]
    .map(name => `vendor/dict/${name}.dat.gz`),
]);
// Fingerprinted files under /assets/ are allowed when something refers to
// them: a page's attribute, or a script that loads them (the NLP worker gets
// the URLs of kuromoji and the emotion dictionary built in).
const assetPath = String.raw`assets\/[\w.-]+\.[a-f0-9]{64}\.(?:js|css|json)`;
const scanned = new Set<string>();
const addReferences = (text: string, pattern: RegExp) => {
  for (const match of text.matchAll(pattern)) allowed.add(match[1]);
};
for (const page of required.filter(name => name.endsWith(".html"))) {
  const html = readFileSync(join(dist, page), "utf8");
  addReferences(html, new RegExp(String.raw`(?:src|href|content)="\/(${assetPath})"`, "g"));
  for (const tag of html.match(/<meta name="xsp-echarts"[^>]*>/g) ?? []) {
    if (!/ data-integrity="sha256-(?:[\w/=+]|&#43;)+"/.test(tag)) {
      throw new Error(`${page} loads ECharts without integrity`);
    }
  }
  // One stylesheet per page, and nothing inline that the CSP (script-src and
  // style-src 'self') would block. JSON-LD is data, not script, so it may stay.
  const stylesheets = html.match(/<link rel="stylesheet"[^>]*>/g) ?? [];
  if (stylesheets.length !== 1) throw new Error(`${page} links ${stylesheets.length} stylesheets, expected 1`);
  for (const tag of [...stylesheets, ...(html.match(/<script [^>]*src="\/assets\/[^>]*>/g) ?? [])]) {
    // Hugo writes "+" in attributes as &#43;; the browser decodes it.
    if (!/ integrity="sha256-(?:[\w/=+]|&#43;)+"/.test(tag)) {
      throw new Error(`${page} loads an asset without integrity: ${tag}`);
    }
  }
  for (const match of html.matchAll(/<script(?![^>]*\ssrc=)([^>]*)>/g)) {
    if (!/type="application\/ld\+json"/.test(match[1])) throw new Error(`${page} has an inline script`);
  }
  if (/<style[\s>]|\sstyle="/.test(html)) throw new Error(`${page} has an inline style`);
}
for (let found = true; found;) {
  found = false;
  for (const name of [...allowed].filter(name => name.endsWith(".js") && !scanned.has(name))) {
    scanned.add(name);
    found = true;
    if (existsSync(join(dist, name))) {
      addReferences(readFileSync(join(dist, name), "utf8"), new RegExp(String.raw`"\/(${assetPath})"`, "g"));
    }
  }
}
for (const name of allowed) {
  if (!existsSync(join(dist, name))) throw new Error(`missing public file: ${name}`);
}
// The vendored files must be the ones tools/vendor.toml records, and
// fingerprint must publish the ones in assets/ unchanged (type declarations
// are only for the tests and are never published).
const vendored = (vendor as { package: Package[] }).package.flatMap(pkg => Object.values(pkg.files));
for (const { to, sha256 } of vendored) {
  if (createHash("sha256").update(readFileSync(join(root, to))).digest("hex") !== sha256) {
    throw new Error(`vendored file differs from tools/vendor.toml: ${to}`);
  }
}
for (
  const source of [
    ...vendored.map(file => file.to).filter(name => name.startsWith("assets/") && !name.endsWith(".d.ts")),
    "assets/vendor/emotion_dict.json",
  ]
) {
  const file = source.slice("assets/vendor/".length);
  const stem = file.slice(0, file.lastIndexOf("."));
  const extension = file.slice(file.lastIndexOf("."));
  const published = [...allowed].filter(name =>
    name.startsWith(`assets/${stem}.`) && name.endsWith(extension)
    && /^[a-f0-9]{64}$/.test(name.slice(`assets/${stem}.`.length, -extension.length))
  );
  if (published.length !== 1) throw new Error(`expected one published copy of ${source}, found ${published.length}`);
  if (!readFileSync(join(dist, published[0])).equals(readFileSync(join(root, source)))) {
    throw new Error(`published file differs from its source: ${published[0]}`);
  }
}
for (const absolute of files) {
  const local = relative(dist, absolute);
  if (!allowed.has(local.split(sep).join("/"))) throw new Error(`unexpected public file: ${local}`);
  const parts = local.split(sep).map((part) => part.toLowerCase());
  const name = parts[parts.length - 1];
  const extension = name.slice(name.lastIndexOf("."));
  if (
    forbiddenNames.has(name) || forbiddenExtensions.has(extension)
    || parts.some((part) => forbiddenDirectoryParts.has(part))
  ) {
    throw new Error(`archive-derived file is present in dist: ${local}`);
  }
}

const sitemap = readFileSync(join(dist, "sitemap.xml"), "utf8");
const origin = String((hugo as { baseURL: string }).baseURL).replace(/\/$/, "");
const pages = required.filter(file => file.endsWith("index.html"));
const expected = pages.map(file => origin + "/" + file.replace(/index\.html$/, ""));
const locations = Array.from(sitemap.matchAll(/<loc>([^<]+)<\/loc>/g), match => match[1]);
if (locations.length !== expected.length || expected.some(url => !locations.includes(url))) {
  throw new Error("sitemap URLs differ from the public Pages routes");
}
for (const [index, file] of pages.entries()) {
  const html = readFileSync(join(dist, file), "utf8");
  if (!html.includes(`<link rel="canonical" href="${expected[index]}">`)) {
    throw new Error(`incorrect canonical URL in ${file}`);
  }
  const ogp = [
    `<meta property="og:image" content="${origin}/images/ogp.png">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta name="twitter:card" content="summary_large_image">`,
  ];
  if (ogp.some(tag => !html.includes(tag))) throw new Error(`incomplete OGP image tags in ${file}`);
}
const headers = readFileSync(join(dist, "_headers"), "utf8");
if (
  !/^\/images\/ogp\.png\r?\n  ! Cross-Origin-Resource-Policy\r?\n  Cross-Origin-Resource-Policy: cross-origin$/m.test(
    headers,
  )
) {
  throw new Error("_headers does not allow cross-origin loads of the OGP image");
}
// The sample report is drawn at build time, so it reads without JS.
const sample = readFileSync(join(dist, "sample/index.html"), "utf8");
const tiles = sample.match(/<div [^>]*id="tiles">(.*?)<\/div><\/div><\/div>\s*<section/s)?.[1] ?? "";
if ((tiles.match(/<div class="tile">/g) ?? []).length !== 6 || !/<h1 [^>]*id="dname">[^<]+<\/h1>/.test(sample)) {
  throw new Error("sample/index.html lacks the build-time header or its 6 tiles");
}
const robots = readFileSync(join(dist, "robots.txt"), "utf8");
if (!robots.split(/\r?\n/).includes(`Sitemap: ${origin}/sitemap.xml`)) {
  throw new Error("robots.txt does not advertise sitemap.xml");
}

console.log(`dist verification passed: ${files.length} files, ${required.length} required routes`);
