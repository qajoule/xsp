# Contributing

Thank you for contributing to X Self Profiler.

## Privacy requirements

- Never add a real X archive, its extracted files, account data, or media to an issue, pull request, commit, or test fixture.
- Use the deterministic sample archive for automated checks.
- Keep all archive parsing in the browser. Do not add server endpoints, analytics, telemetry, or external API calls for archive contents.

## Local checks

Install the pinned tools with mise, then run the checks. Node.js and npm are not needed.

```text
mise install
mise run check
```

Use `mise run preview` to test the production build locally. It does not apply `static/_headers`; check headers on a Cloudflare Pages preview.

## Pull requests

- Explain the user-visible behavior and the privacy impact.
- Add or update a deterministic test when changing parsing, analysis, ZIP handling, or rendering contracts.
- Run formatting, type checking, and the relevant browser path before requesting review.
- Preserve third-party notices when updating vendored libraries or dictionaries.
