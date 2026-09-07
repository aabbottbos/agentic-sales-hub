#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec pnpm --silent exec tsx "$HERE/protect-paths.ts"
