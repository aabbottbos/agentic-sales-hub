/**
 * Shared JSON-extraction helper, used by every LLM-backed generation skill to
 * tolerate a model wrapping its JSON answer in prose or a code fence —
 * extracted once call-prep needed the same logic call-summary already had,
 * following the same pattern as citation-span.ts.
 */

/**
 * Extract the first balanced top-level JSON object from a model response. The
 * prompt asks for bare JSON; this tolerates the model wrapping it in a sentence
 * or a code fence.
 */
export function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') {
      inStr = true;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}
