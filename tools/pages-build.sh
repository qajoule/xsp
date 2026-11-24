#!/usr/bin/env bash
# Build command for the Cloudflare Pages project (Git integration).
#
# The Pages build image has neither mise nor the pinned Hugo and Tailwind
# builds. This script downloads a pinned mise binary, verifies its SHA-256,
# installs the tools at the versions and URLs recorded in mise.lock, then runs
# the production build and the dist/ check. Pages serves
# dist/ only when this script exits 0.
#
# Pages settings: build command `bash tools/pages-build.sh`, output `dist`.
set -euo pipefail

mise_version="v2026.11.13"
# From SHASUMS256.txt of the jdx/mise release above.
mise_sha256="9c8cc9e10886fe1b1ae2ff625f34905f3bd94e47ee5c9b0d3d597e6629d43d20"

bin_dir="${HOME}/.local/bin"
mise="${bin_dir}/mise"
mkdir -p "${bin_dir}"
curl --fail --silent --show-error --location --retry 3 --output "${mise}" \
  "https://github.com/jdx/mise/releases/download/${mise_version}/mise-${mise_version}-linux-x64"
echo "${mise_sha256}  ${mise}" | sha256sum --check --quiet
chmod +x "${mise}"

# The build runs from a fresh clone, so trust this checkout's mise.toml.
export MISE_TRUSTED_CONFIG_PATHS="${PWD}"
# Take every download URL from mise.lock instead of the GitHub API, which
# rate-limits the shared build machines.
export MISE_LOCKED=1
"${mise}" install
"${mise}" run check:dist
