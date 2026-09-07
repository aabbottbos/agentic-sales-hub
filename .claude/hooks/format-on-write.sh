#!/usr/bin/env bash
# PostToolUse hook: prettier-format a just-written source file under packages/ or
# evals/. Skips context/** (corpus prose is data). Never blocks.
set -uo pipefail

INPUT="$(cat)"
FILE_PATH="$(printf '%s' "$INPUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log((JSON.parse(s).tool_input||{}).file_path||"")}catch{console.log("")}})' 2>/dev/null || true)"

[ -z "$FILE_PATH" ] && exit 0

case "$FILE_PATH" in
  *context/*) exit 0 ;;
esac

case "$FILE_PATH" in
  *packages/*.ts|*packages/*.tsx|*packages/*.js|*packages/*.json|\
  *evals/*.ts|*evals/*.tsx|*evals/*.js|*evals/*.json)
    pnpm --silent exec prettier --write "$FILE_PATH" >/dev/null 2>&1 || true
    ;;
esac

exit 0
