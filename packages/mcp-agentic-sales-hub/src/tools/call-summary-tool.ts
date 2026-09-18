import { z } from "zod";
import type { McpServer, RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { runSkill } from "@agentic-sales-hub/skills";
import type { SummaryOutput } from "@agentic-sales-hub/skills";
import { actorInputSchema, assertNotTainted, getSharedLoader } from "./shared.js";
import { renderCallSummaryBody } from "./render-call-summary.js";

const callSummaryInputShape = {
  actor: actorInputSchema,
  meeting_path: z.string().min(1),
};

/** Mirrors `OPP_DIR_RE` in `packages/context-core/src/validate-corpus.ts` —
 *  the existing precedent for pulling `{accountSlug, crmId}` out of a
 *  `context/accounts/<slug>/opportunities/<crmId>/...` path shape.
 *
 *  Exported (Task 10) because the file watcher (`src/watcher.ts`) is a
 *  second call site needing the exact same derivation for the same reason
 *  (deriving `{accountSlug, crmId}` from a `meeting_path` before persisting a
 *  `call-summary` artifact) — with two consumers, importing beats the
 *  single-caller duplication precedent `OPP_DIR_RE` itself set here. */
const OPP_DIR_RE = /^context\/accounts\/([^/]+)\/opportunities\/([^/]+)\//;

export function parseOpportunityPath(path: string): { accountSlug: string; crmId: string } {
  const m = OPP_DIR_RE.exec(path.replaceAll("\\", "/"));
  if (!m) {
    throw new Error(
      `call-summary: could not derive accountSlug/crmId from meeting_path "${path}" ` +
        `(expected context/accounts/<slug>/opportunities/<crmId>/...)`,
    );
  }
  // Capture groups are guaranteed present when the overall match succeeds —
  // the regex has exactly two required, non-optional groups.
  return { accountSlug: m[1]!, crmId: m[2]! };
}

/**
 * Registers the `call-summary` tool on the given server.
 *
 * Unlike `call-prep`, `call-summary` has NO write grant — `runSkill` returns
 * only its structured `SummaryOutput`. This handler is the "separate step"
 * that persists it (mirroring `write-findings.ts`'s role for `sow-review`):
 * render, then check the rendered content against the taint ledger, then
 * `writeArtifact()`.
 *
 * The taint check matters specifically here because `call-summary`'s read
 * grant now covers `inbound/**` (plan 005 Task 5) — a quarantined,
 * untrusted counterparty document. If a prompt-injection outcome caused the
 * model's summary to include verbatim lifted content from that document,
 * persisting it as-is would launder untrusted content into the trusted
 * `context/accounts/**` tree. `.claude/hooks/quarantine-inbound.ts` blocks
 * this in the normal Claude Code environment, but that `PreToolUse` hook
 * does not wrap this separate MCP server process (spec 005 JC#3) — so
 * `assertNotTainted` reimplements the same guarantee in-process here.
 *
 * Returns the `RegisteredTool` handle so callers (tests, in particular) can
 * invoke `.handler(...)` directly without going through a transport.
 */
export function registerCallSummaryTool(server: McpServer): RegisteredTool {
  return server.registerTool(
    "call-summary",
    {
      title: "Call summary",
      description:
        "Summarize one sales meeting note (or, for the file watcher, a quarantined inbound " +
        "document) into a structured recap — commitments, next steps, and opportunity context " +
        "deltas, each citing the source note. The summary is persisted as a new artifact.",
      inputSchema: callSummaryInputShape,
    },
    async ({ actor, meeting_path }): Promise<CallToolResult> => {
      const loader = await getSharedLoader();
      const { accountSlug, crmId } = parseOpportunityPath(meeting_path);

      const result = await runSkill(
        "call-summary",
        { meeting_path },
        {
          loader,
          scopeParams: {},
          actor,
        },
      );

      const rendered = renderCallSummaryBody(result.output as SummaryOutput);

      // Check the whole rendered body as one string — the simplest, most
      // protective single check (anything lifted from a tainted source and
      // reproduced verbatim anywhere in the body trips the ledger's
      // substring match) — plus each flattened citation's claim text
      // individually, so a match names which specific claim was tainted
      // rather than just "somewhere in the body".
      await assertNotTainted(loader, rendered.body, ...rendered.citations.map((c) => c.claim));

      const written = await loader.writeArtifact({
        accountSlug,
        crmId,
        kind: "summary",
        generatedBy: "call-summary",
        title: rendered.title,
        body: rendered.body,
        citations: rendered.citations,
        unsourcedClaims: rendered.unsourcedClaims,
        actor,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                artifactPath: written.artifactPath,
                citationsValid: result.citationsValid,
                output: result.output,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
