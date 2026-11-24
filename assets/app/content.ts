// The page copy. Its source is data/content.toml: Hugo templates render the
// static copy into the HTML, and js.html passes the same data to the bundles
// that render copy at run time as params.content. Edit the copy there.
import params from "@params";

const { content } = params as { content?: Record<string, unknown> };
if (!content) throw new Error("page copy is missing; js.html must pass data/content.toml as params.content");

export const CONTENT: Record<string, unknown> = content;
