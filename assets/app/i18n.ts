/*
 * Looks up the page copy (data/content.toml, through content.ts).
 *   T(path, values)          returns the copy at a dotted path such as
 *                            "sections.rhythm.note", with {placeholders} filled.
 *   T(path, values, "html")  escapes the filled values for use in trusted markup.
 * Hugo renders the static copy into the HTML; this is for copy drawn at run time.
 */
import { CONTENT } from "./content";

export type Values = Record<string, string | number>;

function getPath(object: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>(
    (value, key) => value == null ? value : (value as Record<string, unknown>)[key],
    object,
  );
}

export function escapeHTMLBody(value: unknown): string {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function substitute(text: string, values: Values, escape: boolean): string {
  return text.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key];
    if (value == null) return match;
    return escape ? escapeHTMLBody(value) : String(value);
  });
}

export function T(path: string, values?: Values, context?: string): string {
  const text = getPath(CONTENT, path);
  if (text == null) {
    console.warn("[content] undefined key:", path);
    return "";
  }
  if (typeof text !== "string") return String(text);
  return values ? substitute(text, values, context === "html") : text;
}
