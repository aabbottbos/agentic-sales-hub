import type { SkillDefinition } from "@agentic-sales-hub/context-core";
import type { RunContext, SkillImpl, SkillImplResult, TraceEntry } from "../types.js";
import { complete } from "./llm.js";
import { buildSystemPrompt, buildUserPrompt } from "./call-summary.prompt.js";
import { validateSummaryOutput, type SummaryOutput } from "./summary-schema.js";

interface CallSummaryInput {
  meeting_path: string;
}

const MODEL = "claude-sonnet-5";
const MAX_TOKENS = 2048;

/**
 * Extract the first balanced top-level JSON object from a model response. The
 * prompt asks for bare JSON; this tolerates the model wrapping it in a sentence
 * or a code fence.
 */
function extractJsonObject(text: string): string | null {
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

/**
 * LLM-backed generation-tier impl (spec 002). Reads exactly one corpus meeting
 * note, asks the model for a structured summary, validates the return against
 * `summary-output.json`. Persists nothing (that is WI-2). Model portability is a
 * v1 non-goal — the call goes through the single `complete` seam.
 */
export const callSummaryImpl: SkillImpl<CallSummaryInput, SummaryOutput> = {
  async run(
    input: CallSummaryInput,
    ctx: RunContext,
    def: SkillDefinition,
  ): Promise<SkillImplResult<SummaryOutput>> {
    const trace: TraceEntry[] = [];
    const meetingPath = input.meeting_path.replaceAll("\\", "/");

    // Resolve the skill's read grant, anchored to the requested note. `resolveScope`
    // itself throws ScopeViolationError if the path is outside the grant globs.
    const scopeResolved = await ctx.loader.resolveScope(def.context_grants, {
      ...ctx.scopeParams,
      documentPath: meetingPath,
    });
    trace.push({
      step: "resolveScope",
      detail: `${scopeResolved.length} files (anchored to ${meetingPath})`,
    });

    // Read the one note through the loader. `file.raw` is the whole file,
    // frontmatter included, LF-normalized — the exact basis `resolveCitation`
    // slices, so the model's [start, end) offsets resolve without conversion.
    const file = await ctx.loader.read(meetingPath);
    const noteText = file.raw;
    trace.push({ step: "readNote", detail: `${noteText.length} chars` });

    const responseText = await complete({
      system: buildSystemPrompt(),
      user: buildUserPrompt(meetingPath, noteText),
      model: MODEL,
      maxTokens: MAX_TOKENS,
    });
    trace.push({ step: "model", detail: `${responseText.length} chars returned` });

    const jsonText = extractJsonObject(responseText);
    if (!jsonText) {
      throw new Error("call-summary: model did not return valid JSON");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      throw new Error("call-summary: model did not return valid JSON");
    }

    const check = validateSummaryOutput(parsed);
    if (!check.valid) {
      throw new Error(
        `call-summary: output failed schema — ${check.errors.slice(0, 5).join("; ")}`,
      );
    }

    return {
      output: parsed as SummaryOutput,
      scopeResolved,
      contextRead: [meetingPath],
      trace,
    };
  },
};
