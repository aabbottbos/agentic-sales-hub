#!/usr/bin/env bash
# PreToolUse hook wrapper. The taint-matching logic is TypeScript (unit-tested);
# this shell script is the entry point the SDLC framework §4 names.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec pnpm --silent exec tsx "$HERE/quarantine-inbound.ts"
