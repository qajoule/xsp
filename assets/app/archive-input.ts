import type { TextByRole } from "./app";

export const ROLE_BY_NAME: Record<string, keyof TextByRole> = {
  "tweets.js": "tweets",
  "personalization.js": "personalization",
  "account.js": "account",
  "following.js": "following",
  "follower.js": "follower",
  "block.js": "block",
  "mute.js": "mute",
  "like.js": "like",
  "grok-chat-item.js": "grok",
};

export interface ArchiveTextFile {
  name: string;
  text(): Promise<string>;
}
export interface ZipArchiveFile extends ArchiveTextFile {
  size: number;
  slice(start?: number, end?: number): Blob;
}
export type ZipExtractor = (file: ZipArchiveFile) => Promise<TextByRole>;

export function baseName(name: string): string {
  return name.replace(/^.*[\\/]/, "").toLowerCase();
}

export const MAX_PARTS_PER_ROLE = 64;
export function wanted(name: string): { role: keyof TextByRole; part: string | null; slot: string } | null {
  const slot = baseName(name);
  const role = ROLE_BY_NAME[slot];
  if (role) return { role, part: null, slot };
  const match = /^(.+)-part([0-9]+)\.js$/.exec(slot);
  if (!match || !ROLE_BY_NAME[`${match[1]}.js`]) return null;
  return { role: ROLE_BY_NAME[`${match[1]}.js`], part: match[2].replace(/^0+(?=[0-9])/u, ""), slot };
}
export function addPart<T>(
  groups: Partial<Record<keyof TextByRole, Array<{ part: string | null; slot: string; value: T }>>>,
  item: NonNullable<ReturnType<typeof wanted>>,
  value: T,
): boolean {
  const parts = groups[item.role] ?? (groups[item.role] = []);
  if (parts.some((part) => part.slot === item.slot)) return false;
  if (parts.length >= MAX_PARTS_PER_ROLE) {
    throw new Error(
      `Archive limit partsPerRole=${MAX_PARTS_PER_ROLE} exceeded; observed=${parts.length + 1} (role=${item.role})`,
    );
  }
  parts.push({ part: item.part, slot: item.slot, value });
  return true;
}
export function ordered<T>(parts: Array<{ part: string | null; slot: string; value: T }>): T[] {
  return [...parts].sort((left, right) =>
    left.part === null
      ? (right.part === null ? 0 : -1)
      : right.part === null
      ? 1
      : left.part.length - right.part.length || left.part.localeCompare(right.part)
        || left.slot.localeCompare(right.slot)
  ).map((part) => part.value);
}
export async function textsFromArchiveFiles(files: Iterable<ArchiveTextFile>): Promise<TextByRole> {
  const texts: TextByRole = {};
  const groups: Partial<
    Record<keyof TextByRole, Array<{ part: string | null; slot: string; value: ArchiveTextFile }>>
  > = {};
  for (const file of files) {
    const match = wanted(file.name);
    if (match) addPart(groups, match, file);
  }
  for (const role of Object.keys(groups) as Array<keyof TextByRole>) {
    const parts = [];
    for (const file of ordered(groups[role]!)) parts.push(await file.text());
    texts[role] = parts.join("\n");
  }
  if (!texts.tweets) throw new Error("tweets archive data was not found");
  return texts;
}

export async function textsFromArchiveInput(
  files: Iterable<ArchiveTextFile>,
  extractZip: ZipExtractor,
): Promise<TextByRole> {
  const selected = [...files];
  try {
    return await textsFromArchiveFiles(selected);
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "tweets archive data was not found") throw error;
    const zip = selected.find((file): file is ZipArchiveFile =>
      baseName(file.name).endsWith(".zip") && "size" in file && "slice" in file
    );
    if (!zip) throw error;
    return extractZip(zip);
  }
}
