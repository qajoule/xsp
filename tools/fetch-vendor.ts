// Fetches the third-party files listed in tools/vendor.toml from the npm
// registry tarballs, without npm. Every tarball must match its integrity
// before anything is written from it.
//
//   mise run vendor         the shipped files ([[package]]). Each file must also
//                           match its SHA-256; any mismatch writes nothing.
//   mise run vendor:types   the type definitions ([[types]]) into .types/,
//                           skipping packages already unpacked at their version
//                           (no network access then).
//
// Prints only what it wrote, then one summary line.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import manifest from "./vendor.toml";

type Tarball = { name: string; version: string; tarball: string; integrity: string };
type Package = Tarball & { files: Record<string, { to: string; sha256: string }> };
type Types = Tarball & { into: string };

const root = join(import.meta.dir, "..");
const { package: packages, types } = manifest as { package: Package[]; types: Types[] };
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const problems: string[] = [];

// Reads a ustar archive (npm tarballs), honoring pax "path" records. Paths
// lose their first segment: npm tarballs keep everything in one top folder,
// usually package/, but DefinitelyTyped uses the package name (node/).
function untar(archive: Uint8Array): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  const text = (start: number, length: number) =>
    new TextDecoder().decode(archive.subarray(start, start + length)).replace(/\0.*$/s, "");
  let paxPath: string | undefined;
  for (let offset = 0; offset + 512 <= archive.length;) {
    const name = text(offset, 100);
    if (!name) break;
    const size = parseInt(text(offset + 124, 12).trim() || "0", 8);
    const type = text(offset + 156, 1);
    const prefix = text(offset + 345, 155);
    const body = archive.subarray(offset + 512, offset + 512 + size);
    if (type === "x") {
      paxPath = new TextDecoder().decode(body).match(/^\d+ path=(.*)$/m)?.[1];
    } else {
      const path = paxPath ?? (prefix ? `${prefix}/${name}` : name);
      if (type === "0" || type === "") files.set(path.slice(path.indexOf("/") + 1), body);
      paxPath = undefined;
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}

// Returns the tarball's files, or undefined after recording a problem.
async function fetchTarball(pkg: Tarball): Promise<Map<string, Uint8Array> | undefined> {
  const response = await fetch(pkg.tarball);
  if (!response.ok) {
    problems.push(`${pkg.name}: ${pkg.tarball} returned ${response.status}`);
    return undefined;
  }
  const tarball = new Uint8Array(await response.arrayBuffer());
  const integrity = `sha512-${createHash("sha512").update(tarball).digest("base64")}`;
  if (integrity !== pkg.integrity) {
    problems.push(`${pkg.name}@${pkg.version}: tarball integrity ${integrity}, expected ${pkg.integrity}`);
    return undefined;
  }
  return untar(Bun.gunzipSync(tarball));
}

function fail(): never {
  console.error(`vendor: nothing written; ${problems.length} problem(s):`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

if (process.argv.includes("--types")) {
  let unpacked = 0;
  for (const pkg of types) {
    const target = join(root, ".types", pkg.into);
    const manifestPath = join(target, "package.json");
    if (existsSync(manifestPath) && JSON.parse(readFileSync(manifestPath, "utf8")).version === pkg.version) continue;
    const entries = await fetchTarball(pkg);
    if (!entries) fail();
    rmSync(target, { recursive: true, force: true });
    for (const [path, bytes] of entries) {
      if (path.startsWith("docs/")) continue;
      const file = join(target, path);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, bytes);
    }
    console.log(`unpacked ${pkg.name}@${pkg.version} into .types/${pkg.into}`);
    unpacked++;
  }
  console.log(`vendor:types: ${unpacked} unpacked, ${types.length - unpacked} up to date`);
  process.exit(0);
}

const writes: Array<[string, Uint8Array]> = [];
for (const pkg of packages) {
  const entries = await fetchTarball(pkg);
  if (!entries) continue;
  for (const [source, { to, sha256: expected }] of Object.entries(pkg.files)) {
    const bytes = entries.get(source);
    if (!bytes) {
      problems.push(`${pkg.name}@${pkg.version}: ${source} is not in the tarball`);
      continue;
    }
    const actual = sha256(bytes);
    if (actual !== expected) {
      problems.push(`${pkg.name}@${pkg.version}: ${source} sha256 ${actual}, expected ${expected}`);
      continue;
    }
    const target = join(root, to);
    if (!existsSync(target) || sha256(readFileSync(target)) !== actual) writes.push([to, bytes]);
  }
}
if (problems.length > 0) fail();
for (const [to, bytes] of writes) {
  mkdirSync(dirname(join(root, to)), { recursive: true });
  writeFileSync(join(root, to), bytes);
  console.log(`wrote ${to}`);
}
const total = packages.reduce((count, pkg) => count + Object.keys(pkg.files).length, 0);
console.log(`vendor: ${writes.length} written, ${total - writes.length} unchanged`);
