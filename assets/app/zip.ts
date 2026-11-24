import type { TextByRole } from "./app";
import { addPart, MAX_PARTS_PER_ROLE, ordered, wanted } from "./archive-input";

export interface ZipFile {
  name: string;
  size: number;
  slice(start?: number, end?: number): Blob;
  stream?: () => ReadableStream<Uint8Array>;
}

type Progress = (current: number, total: number) => Promise<void> | void;
type Entry = {
  name: string;
  flags: number;
  method: number;
  csize: number | null;
  usize: number | null;
  localOffset: number;
};
type FflateEntry = {
  name: string;
  compression: number;
  ondata: (error: Error | null, data: Uint8Array, final: boolean) => void;
  start(): void;
};
type FflateUnzip = {
  register(ctor: unknown): void;
  onfile: (entry: FflateEntry) => void;
  push(bytes: Uint8Array, final: boolean): void;
};
type Fflate = {
  Inflate: new(
    ondata: (chunk: Uint8Array, final: boolean) => void,
  ) => { push(bytes: Uint8Array, final: boolean): void };
  Unzip: new() => FflateUnzip;
  UnzipInflate: unknown;
};

const SIG = {
  local: 0x04034b50,
  central: 0x02014b50,
  eocd: 0x06054b50,
  zip64Eocd: 0x06064b50,
  zip64Locator: 0x07064b50,
  centralSignature: 0x05054b50,
};
const MAX_EOCD_BYTES = 22 + 0xffff;
export const ZIP_LIMITS = Object.freeze({
  totalUncompressedBytes: 256 * 1024 * 1024,
  compressionRatio: 200,
  centralDirectoryEntries: 100000,
  centralDirectoryBytes: 256 * 1024 * 1024,
  partsPerRole: MAX_PARTS_PER_ROLE,
  inflateInputChunkBytes: 64 * 1024,
  streamingInputChunkBytes: 64 * 1024,
});

class ZipFallbackError extends Error {
  readonly fallbackEligible = true;
}
const fallback = (message: string): ZipFallbackError => new ZipFallbackError(message);
const fflate = (): Fflate => {
  const value = (globalThis as typeof globalThis & { fflate?: Fflate }).fflate;
  if (!value) throw new Error("fflate is not available");
  return value;
};
const concat = (chunks: ReadonlyArray<Uint8Array<ArrayBufferLike>>): Uint8Array => {
  const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
};
const limitError = (name: string, limit: number, observed: number, detail = ""): Error =>
  new Error(`ZIP limit ${name}=${limit} exceeded; observed=${observed}${detail ? ` (${detail})` : ""}`);
const ratio = (usize: number, csize: number): number => csize === 0 ? (usize === 0 ? 0 : Infinity) : usize / csize;

function checkedUint64(view: DataView, offset: number, label: string): number {
  if (offset + 8 > view.byteLength) throw new Error(`truncated ${label}`);
  const value = view.getUint32(offset, true) + view.getUint32(offset + 4, true) * 0x100000000;
  if (!Number.isSafeInteger(value)) throw new Error(`${label} exceeds JavaScript's safe integer range`);
  return value;
}
async function slice(file: ZipFile, start: number, end: number): Promise<Uint8Array> {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end > file.size) {
    throw new Error("ZIP range is outside the selected file");
  }
  return new Uint8Array(await file.slice(start, end).arrayBuffer());
}
function zip64Values(extra: Uint8Array, needs: Record<string, boolean>): Record<string, number> {
  const view = new DataView(extra.buffer, extra.byteOffset, extra.byteLength);
  let cursor = 0;
  while (cursor + 4 <= extra.length) {
    const id = view.getUint16(cursor, true);
    const size = view.getUint16(cursor + 2, true);
    cursor += 4;
    if (cursor + size > extra.length) throw new Error("truncated ZIP extra field");
    if (id === 1) {
      const values: Record<string, number> = {};
      for (const key of ["usize", "csize", "localOffset"]) {
        if (needs[key]) {
          if (cursor + 8 > extra.length) throw new Error(`truncated ZIP64 ${key}`);
          values[key] = checkedUint64(view, cursor, `ZIP64 ${key}`);
          cursor += 8;
        }
      }
      if (needs.diskStart) {
        if (cursor + 4 > extra.length) throw new Error("truncated ZIP64 disk start");
        values.diskStart = view.getUint32(cursor, true);
      }
      return values;
    }
    cursor += size;
  }
  throw new Error("ZIP64 extra field is missing");
}
export async function readCentralDirectory(file: ZipFile): Promise<{ bytes: Uint8Array; entryCount: number }> {
  if (!Number.isSafeInteger(file.size) || file.size < 22) throw fallback("ZIP does not support seek reads");
  const tailStart = Math.max(0, file.size - MAX_EOCD_BYTES);
  const tail = await slice(file, tailStart, file.size);
  const view = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  let offset = -1;
  for (let index = tail.length - 22; index >= 0; index--) {
    if (view.getUint32(index, true) === SIG.eocd && index + 22 + view.getUint16(index + 20, true) === tail.length) {
      offset = index;
      break;
    }
  }
  if (offset < 0) throw fallback("ZIP end of central directory was not found");
  const disk = view.getUint16(offset + 4, true),
    centralDisk = view.getUint16(offset + 6, true),
    entriesOnDisk = view.getUint16(offset + 8, true);
  let entryCount = view.getUint16(offset + 10, true),
    centralSize = view.getUint32(offset + 12, true),
    centralOffset = view.getUint32(offset + 16, true);
  if (disk !== 0 || centralDisk !== 0 || (entriesOnDisk !== entryCount && entriesOnDisk !== 0xffff)) {
    throw new Error("multi-disk ZIP is not supported by seek extraction");
  }
  if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    const absolute = tailStart + offset;
    if (absolute < 20) throw new Error("ZIP64 locator is missing");
    const locator = await slice(file, absolute - 20, absolute);
    const locatorView = new DataView(locator.buffer, locator.byteOffset, locator.byteLength);
    if (locatorView.getUint32(0, true) !== SIG.zip64Locator) throw new Error("ZIP64 locator is missing");
    if (locatorView.getUint32(4, true) !== 0 || locatorView.getUint32(16, true) !== 1) {
      throw new Error("multi-disk ZIP64 is not supported by seek extraction");
    }
    const zip64 = await slice(
      file,
      checkedUint64(locatorView, 8, "ZIP64 EOCD offset"),
      checkedUint64(locatorView, 8, "ZIP64 EOCD offset") + 56,
    );
    const zip64View = new DataView(zip64.buffer, zip64.byteOffset, zip64.byteLength);
    if (zip64View.getUint32(0, true) !== SIG.zip64Eocd || checkedUint64(zip64View, 4, "ZIP64 EOCD size") < 44) {
      throw new Error("ZIP64 EOCD is invalid");
    }
    if (
      zip64View.getUint32(16, true) !== 0 || zip64View.getUint32(20, true) !== 0
      || checkedUint64(zip64View, 24, "ZIP64 entries on disk") !== checkedUint64(zip64View, 32, "ZIP64 entry count")
    ) throw new Error("multi-disk ZIP64 is not supported by seek extraction");
    entryCount = checkedUint64(zip64View, 32, "ZIP64 entry count");
    centralSize = checkedUint64(zip64View, 40, "ZIP64 central directory size");
    centralOffset = checkedUint64(zip64View, 48, "ZIP64 central directory offset");
  }
  if (entryCount > ZIP_LIMITS.centralDirectoryEntries) {
    throw limitError("centralDirectoryEntries", ZIP_LIMITS.centralDirectoryEntries, entryCount);
  }
  if (centralSize > ZIP_LIMITS.centralDirectoryBytes) {
    throw limitError("centralDirectoryBytes", ZIP_LIMITS.centralDirectoryBytes, centralSize);
  }
  if (centralOffset + centralSize > file.size) throw new Error("central directory is outside the selected file");
  return { bytes: await slice(file, centralOffset, centralOffset + centralSize), entryCount };
}
export function selectCentralEntries(
  bytes: Uint8Array,
  entryCount: number,
): Partial<Record<keyof TextByRole, Entry[]>> {
  if (entryCount > ZIP_LIMITS.centralDirectoryEntries) {
    throw limitError("centralDirectoryEntries", ZIP_LIMITS.centralDirectoryEntries, entryCount);
  }
  if (bytes.length > ZIP_LIMITS.centralDirectoryBytes) {
    throw limitError("centralDirectoryBytes", ZIP_LIMITS.centralDirectoryBytes, bytes.length);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    groups: Partial<Record<keyof TextByRole, Array<{ part: string | null; slot: string; value: Entry }>>> = {};
  const decoder = new TextDecoder();
  let cursor = 0;
  for (let index = 0; index < entryCount; index++) {
    if (cursor + 46 > bytes.length || view.getUint32(cursor, true) !== SIG.central) {
      throw fallback("central directory entry is invalid");
    }
    const flags = view.getUint16(cursor + 8, true),
      method = view.getUint16(cursor + 10, true),
      nameLength = view.getUint16(cursor + 28, true),
      extraLength = view.getUint16(cursor + 30, true),
      commentLength = view.getUint16(cursor + 32, true);
    let csize = view.getUint32(cursor + 20, true),
      usize = view.getUint32(cursor + 24, true),
      diskStart = view.getUint16(cursor + 34, true),
      localOffset = view.getUint32(cursor + 42, true);
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    if (next > bytes.length) throw fallback("central directory entry is truncated");
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    const match = wanted(name);
    if (match && !(groups[match.role] ?? []).some((part) => part.slot === match.slot)) {
      const needs = {
        usize: usize === 0xffffffff,
        csize: csize === 0xffffffff,
        localOffset: localOffset === 0xffffffff,
        diskStart: diskStart === 0xffff,
      };
      if (Object.values(needs).some(Boolean)) {
        const values = zip64Values(
          bytes.subarray(cursor + 46 + nameLength, cursor + 46 + nameLength + extraLength),
          needs,
        );
        usize = values.usize ?? usize;
        csize = values.csize ?? csize;
        localOffset = values.localOffset ?? localOffset;
        diskStart = values.diskStart ?? diskStart;
      }
      if (diskStart !== 0) throw new Error("selected ZIP entry is on another disk");
      addPart(groups, match, { name, flags, method, csize, usize, localOffset });
    }
    cursor = next;
  }
  if (
    cursor !== bytes.length
    && !(cursor + 6 <= bytes.length && view.getUint32(cursor, true) === SIG.centralSignature
      && cursor + 6 + view.getUint16(cursor + 4, true) === bytes.length)
  ) throw fallback("central directory has unexpected trailing data");
  const selected: Partial<Record<keyof TextByRole, Entry[]>> = {};
  for (
    const [role, parts] of Object.entries(groups) as Array<
      [keyof TextByRole, NonNullable<typeof groups[keyof TextByRole]>]
    >
  ) selected[role] = ordered(parts);
  return selected;
}
function validate(entry: Entry, totals: { declared: number; produced: number }, source: string): void {
  if (entry.flags & 1) throw new Error(`encrypted ZIP entries are not supported (${source})`);
  if (entry.method !== 0 && entry.method !== 8) {
    throw new Error(`unsupported ZIP compression method ${entry.method} (${source})`);
  }
  if (entry.usize === null || entry.csize === null) return;
  const declared = totals.declared + entry.usize;
  if (declared > ZIP_LIMITS.totalUncompressedBytes) {
    throw limitError("totalUncompressedBytes", ZIP_LIMITS.totalUncompressedBytes, declared, `declared, ${source}`);
  }
  if (ratio(entry.usize, entry.csize) > ZIP_LIMITS.compressionRatio) {
    throw limitError(
      "compressionRatio",
      ZIP_LIMITS.compressionRatio,
      ratio(entry.usize, entry.csize),
      `declared, ${source}`,
    );
  }
  totals.declared = declared;
}
function limiter(
  entry: Entry,
  totals: { declared: number; produced: number },
  source: string,
): { accept(chunk: Uint8Array): void; finish(compressed?: number): void } {
  let produced = 0;
  return {
    accept(chunk) {
      const next = produced + chunk.length, total = totals.produced + chunk.length;
      if (total > ZIP_LIMITS.totalUncompressedBytes) {
        throw limitError("totalUncompressedBytes", ZIP_LIMITS.totalUncompressedBytes, total, `actual, ${source}`);
      }
      if (entry.usize !== null && next > entry.usize) {
        throw new Error(`uncompressed ZIP size does not match the declared size (${source})`);
      }
      if (entry.csize !== null && ratio(next, entry.csize) > ZIP_LIMITS.compressionRatio) {
        throw limitError(
          "compressionRatio",
          ZIP_LIMITS.compressionRatio,
          ratio(next, entry.csize),
          `actual, ${source}`,
        );
      }
      produced = next;
      totals.produced = total;
    },
    finish(compressed) {
      if (entry.usize !== null && produced !== entry.usize) {
        throw new Error(`uncompressed ZIP size does not match the declared size (${source})`);
      }
      if (
        entry.csize === null && compressed !== undefined && ratio(produced, compressed) > ZIP_LIMITS.compressionRatio
      ) {
        throw limitError(
          "compressionRatio",
          ZIP_LIMITS.compressionRatio,
          ratio(produced, compressed),
          `actual, ${source}`,
        );
      }
    },
  };
}
function inflate(
  compressed: Uint8Array,
  entry: Entry,
  totals: { declared: number; produced: number },
  source: string,
): Uint8Array {
  const check = limiter(entry, totals, source);
  const chunks: Uint8Array[] = [];
  const run = (onchunk: (chunk: Uint8Array) => void): void => {
    const inflater = new (fflate().Inflate)((chunk) => onchunk(chunk));
    for (let offset = 0; offset < compressed.length; offset += ZIP_LIMITS.inflateInputChunkBytes) {
      const end = Math.min(compressed.length, offset + ZIP_LIMITS.inflateInputChunkBytes);
      inflater.push(compressed.subarray(offset, end), end === compressed.length);
    }
    if (compressed.length === 0) inflater.push(compressed, true);
  };
  run((chunk) => check.accept(chunk));
  check.finish();
  run((chunk) => {
    if (chunk.length) chunks.push(chunk);
  });
  return concat(chunks);
}
function localHeaderTracker(): { push(bytes: Uint8Array): void; claim(name: string): Entry } {
  const maximum = 30 + 0xffff + 0xffff + ZIP_LIMITS.streamingInputChunkBytes, decoder = new TextDecoder();
  let recent: Uint8Array<ArrayBufferLike> = new Uint8Array(), total = 0, last = -1;
  return {
    push(bytes) {
      total += bytes.length;
      recent = concat([recent, bytes]);
      if (recent.length > maximum) recent = new Uint8Array(recent.slice(recent.length - maximum));
    },
    claim(name) {
      const view = new DataView(recent.buffer, recent.byteOffset, recent.byteLength), base = total - recent.length;
      for (let cursor = 0; cursor + 30 <= recent.length; cursor++) {
        const absolute = base + cursor;
        if (absolute <= last || view.getUint32(cursor, true) !== SIG.local) continue;
        const nameLength = view.getUint16(cursor + 26, true),
          extraLength = view.getUint16(cursor + 28, true),
          end = cursor + 30 + nameLength + extraLength;
        if (end > recent.length || decoder.decode(recent.subarray(cursor + 30, cursor + 30 + nameLength)) !== name) {
          continue;
        }
        const flags = view.getUint16(cursor + 6, true),
          method = view.getUint16(cursor + 8, true),
          descriptor = Boolean(flags & 8);
        last = absolute;
        return {
          name,
          flags,
          method,
          csize: descriptor ? null : view.getUint32(cursor + 18, true),
          usize: descriptor ? null : view.getUint32(cursor + 22, true),
          localOffset: absolute,
        };
      }
      throw new Error(`streaming ZIP local header metadata is unavailable for ${name}`);
    },
  };
}
export async function extractZipSeek(file: ZipFile, onProgress?: Progress): Promise<TextByRole> {
  const central = await readCentralDirectory(file);
  const selected = selectCentralEntries(central.bytes, central.entryCount);
  const totals = { declared: 0, produced: 0 };
  for (const entries of Object.values(selected)) {
    for (const entry of entries ?? []) validate(entry, totals, `central entry ${entry.name}`);
  }
  const total = Object.values(selected).reduce((sum, entries) => sum + (entries?.length ?? 0), 0);
  let done = 0;
  const output: TextByRole = {}, decoder = new TextDecoder();
  for (const [role, entries] of Object.entries(selected) as Array<[keyof TextByRole, Entry[]]>) {
    const texts: string[] = [];
    for (const entry of entries) {
      const header = await slice(file, entry.localOffset, entry.localOffset + 30);
      const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
      if (view.getUint32(0, true) !== SIG.local) throw fallback("local ZIP header is invalid");
      const dataOffset = entry.localOffset + 30 + view.getUint16(26, true) + view.getUint16(28, true);
      const compressed = await slice(file, dataOffset, dataOffset + (entry.csize ?? 0));
      if (entry.method === 0) {
        const check = limiter(entry, totals, `seek entry ${entry.name}`);
        check.accept(compressed);
        check.finish();
        texts.push(decoder.decode(compressed));
      } else texts.push(decoder.decode(inflate(compressed, entry, totals, `seek entry ${entry.name}`)));
      done++;
      await onProgress?.(done, total);
    }
    output[role] = texts.join("\n");
  }
  return output;
}
export async function extractZipStreaming(file: ZipFile, onProgress?: Progress): Promise<TextByRole> {
  const groups: Partial<
      Record<keyof TextByRole, Array<{ part: string | null; slot: string; value: { text: string } }>>
    > = {},
    totals = { declared: 0, produced: 0 },
    headers = localHeaderTracker();
  let failure: Error | null = null;
  const unzip = new (fflate().Unzip)();
  unzip.register(fflate().UnzipInflate);
  unzip.onfile = (entry) => {
    const match = wanted(entry.name);
    if (!match) return;
    try {
      const metadata = headers.claim(entry.name);
      if (metadata.method !== entry.compression) {
        throw new Error("streaming ZIP compression method does not match the local header");
      }
      const record = { text: "" };
      if (!addPart(groups, match, record)) return;
      validate(metadata, totals, `local entry ${entry.name}`);
      const check = limiter(metadata, totals, `streaming entry ${entry.name}`), chunks: Uint8Array[] = [];
      entry.ondata = (error, data, final) => {
        if (error) {
          failure ??= error;
          return;
        }
        try {
          if (data.length) {
            check.accept(data);
            chunks.push(data);
          }
          if (final) {
            check.finish();
            record.text = new TextDecoder().decode(concat(chunks));
          }
        } catch (caught) {
          failure ??= caught instanceof Error ? caught : new Error(String(caught));
        }
      };
      entry.start();
    } catch (caught) {
      failure ??= caught instanceof Error ? caught : new Error(String(caught));
    }
  };
  const push = (bytes: Uint8Array, final: boolean): void => {
    for (let offset = 0; offset < bytes.length; offset += ZIP_LIMITS.streamingInputChunkBytes) {
      const end = Math.min(bytes.length, offset + ZIP_LIMITS.streamingInputChunkBytes),
        chunk = bytes.subarray(offset, end);
      headers.push(chunk);
      unzip.push(chunk, final && end === bytes.length);
      if (failure) throw failure;
    }
    if (bytes.length === 0) unzip.push(bytes, final);
  };
  if (file.stream) {
    const reader = file.stream().getReader();
    let read = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          push(new Uint8Array(), true);
          break;
        }
        read += value.length;
        push(value, false);
        await onProgress?.(read, file.size);
      }
    } catch (error) {
      await reader.cancel(error).catch(() => {});
      throw error;
    }
  } else push(new Uint8Array(await file.slice(0, file.size).arrayBuffer()), true);
  if (failure) throw failure;
  const output: TextByRole = {};
  for (
    const [role, parts] of Object.entries(groups) as Array<
      [keyof TextByRole, NonNullable<typeof groups[keyof TextByRole]>]
    >
  ) output[role] = ordered(parts).map((part) => part.text).join("\n");
  return output;
}
export async function extractZipWithFallback(
  file: ZipFile,
  seekProgress?: Progress,
  streamProgress?: Progress,
): Promise<{ textByRole: TextByRole; path: "seek" | "streaming"; seekError: Error | null }> {
  try {
    return { textByRole: await extractZipSeek(file, seekProgress), path: "seek", seekError: null };
  } catch (error) {
    if (!(error instanceof ZipFallbackError)) throw error;
    return { textByRole: await extractZipStreaming(file, streamProgress), path: "streaming", seekError: error };
  }
}
