# X Self Profiler

X Self Profiler analyzes an X archive entirely in the browser. Archive contents are not sent to a server, and direct messages are not analyzed.

## What it shows

- Posting activity, time patterns, sources, reactions, links, and mentions
- Frequently used words, proper nouns, verbs, adjectives, interjections, and emoji
- Language indicators such as first-person words, assertions, uncertainty, negation, and emotion terms
- A comparison between X advertising interests and the archive-derived profile

The analysis is an aid for reflection, not a psychological diagnosis.

## Development

Tool versions are pinned in `mise.toml` and `mise.lock`. Install [mise](https://mise.jdx.dev/), then run:

```text
mise install
mise run check
```

Node.js is not used. Bun runs the unit tests and the scripts in `tools/`; Hugo builds the site and bundles the browser code; the Tailwind CSS CLI (the standalone binary) compiles the styles before each build. tsgo type checks the browser code with `tsconfig.json`, and the tests and tools with `tsconfig.bun.json`, whose type definitions (Bun and Node) are unpacked into `.types/` from the tarballs listed in `tools/vendor.toml`. `mise run dev` starts a local Hugo server next to the Tailwind watcher, and `mise run preview` serves the production build. Neither applies `static/_headers` (CSP and other headers), which only take effect on Cloudflare Pages. `mise tasks` lists every task.

### Where files live

Page code and styles are in `assets/` and go through Hugo's asset pipeline, which gives each output file a fingerprinted name under `/assets/`. Pages are styled with Tailwind utilities in `layouts/` and `assets/app/`. `assets/styles/main.css` is the Tailwind entry, with the color tokens and the element defaults, and `assets/styles/components.css` holds the few class components; `mise run css` compiles them into `assets/styles/tailwind.css`, which is not committed. The bundled libraries (ECharts, fflate, kuromoji) and the emotion dictionary are in `assets/vendor/` and are published unchanged under fingerprinted names. `tools/vendor.toml` records where each vendored file comes from and its SHA-256; `mise run vendor` fetches them again, and `mise run check` fails if one differs. The page copy is `data/content.toml`, which both the Hugo templates and the browser code read. The sample report's data is `data/sample.json`.

`static/` holds only the files that must be served under a fixed name:

| Path                          | Why it stays in `static/`                                                                                                                                                         |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `_headers`, `_redirects`      | Cloudflare Pages reads them by these names from the root of the output.                                                                                                           |
| `googlef6f8e0235e04c590.html` | Google Search Console fetches this exact name to verify site ownership.                                                                                                           |
| `favicon.svg`                 | Every page links to `/favicon.svg`. It is small and rarely changes, so a fingerprinted name would gain little.                                                                    |
| `legal/`                      | The footer links to these files by fixed URLs, and `_headers` serves them as plain text. `legal/LICENSE` is not a copy of `LICENSE`: it adds a note about the bundled components. |
| `vendor/dict/`                | kuromoji builds each dictionary file's URL from a directory and a fixed file name, so the files cannot be renamed.                                                                |

## Deployment

Build with `mise run build` and serve `dist/` through Cloudflare Pages. The intended project name is `xself`.

## Privacy

Do not commit X archives or extracted account files. `.gitignore` excludes common archive paths and ZIP files, but contributors must verify staged paths before committing.

## License

The project is licensed under the [MIT License](LICENSE). See [third-party notices](static/legal/THIRD_PARTY_NOTICES.md) for bundled libraries and dictionaries.
