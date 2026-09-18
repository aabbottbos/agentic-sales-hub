import { z } from "zod";
import type { McpServer, RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { runSkill } from "@agentic-sales-hub/skills";
import { actorInputSchema, getSharedLoader } from "./shared.js";

const callPrepInputShape = {
  actor: actorInputSchema,
  account_slug: z.string().min(1),
  opp_id: z.string().min(1),
  meeting_context: z.string().min(1).optional(),
};

/**
 * Registers the `call-prep` tool on the given server.
 *
 * A thin MCP-protocol wrapper around `runSkill("call-prep", ...)` — no new
 * skill logic here. `call-prep` has a write grant, so `runSkill` persists the
 * generated brief via `writeArtifact()` (and opens an `unused` outcome
 * record) internally; this handler does not call `writeArtifact` itself.
 *
 * Returns the `RegisteredTool` handle so callers (tests, in particular) can
 * invoke `.handler(...)` directly without going through a transport.
 */
export function registerCallPrepTool(server: McpServer): RegisteredTool {
  return server.registerTool(
    "call-prep",
    {
      title: "Call prep",
      description:
        "Prepare a call-prep brief for an upcoming meeting on one opportunity — goal, " +
        "what we know, talking points, and risks, each citing supporting context. The " +
        "brief is persisted as a new artifact automatically.",
      inputSchema: callPrepInputShape,
    },
    async ({ actor, account_slug, opp_id, meeting_context }): Promise<CallToolResult> => {
      const loader = await getSharedLoader();

      const result = await runSkill(
        "call-prep",
        {
          account_slug,
          opp_id,
          ...(meeting_context ? { meeting_context } : {}),
        },
        {
          loader,
          scopeParams: { accountSlug: account_slug, oppId: opp_id },
          actor,
        },
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                artifactPath: result.artifactPath,
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
