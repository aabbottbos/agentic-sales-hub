import { describe, expect, it } from "vitest";
import { buildUserPrompt, type ContextFile } from "./call-prep.prompt.js";

describe("call-prep buildUserPrompt", () => {
  it("with an empty contextFiles array, emits the explicit no-documents line instead of a silent gap", () => {
    const u = buildUserPrompt("acme-logistics", "OPP", undefined, []);
    expect(u).toContain("No source documents were provided for this opportunity.");
    expect(u).not.toContain("<<<FILE:");
    expect(u).not.toContain("file blocks below");
  });

  it("with meetingContext present, includes it and marks it clearly as non-citable", () => {
    const u = buildUserPrompt("acme-logistics", "OPP", "Focus on renewal timing.", []);
    expect(u).toContain("Focus on renewal timing.");
    expect(u).toMatch(/NOT a citable source/);
  });

  it("with meetingContext undefined, omits the meeting-context block entirely", () => {
    const u = buildUserPrompt("acme-logistics", "OPP", undefined, []);
    expect(u).not.toMatch(/Meeting context/);
    expect(u).not.toMatch(/NOT a citable source/);
  });

  it("with meetingContext as a whitespace-only string, behaves the same as absent", () => {
    const u = buildUserPrompt("acme-logistics", "OPP", "   ", []);
    expect(u).not.toMatch(/Meeting context/);
    expect(u).not.toMatch(/NOT a citable source/);
  });

  it("with multiple files, each path appears in its own delimiter and each file's raw content appears between its own markers", () => {
    const files: ContextFile[] = [
      {
        path: "context/accounts/acme-logistics/opportunities/OPP/opportunity.md",
        raw: "Opportunity body text",
      },
      { path: "context/org/company.md", raw: "Org evidence body text" },
    ];
    const u = buildUserPrompt("acme-logistics", "OPP", undefined, files);

    for (const file of files) {
      expect(u).toContain(`<<<FILE: ${file.path}>>>`);
      const start = u.indexOf(`<<<FILE: ${file.path}>>>`) + `<<<FILE: ${file.path}>>>`.length + 1;
      const end = u.indexOf("<<<END FILE>>>", start) - 1;
      expect(u.slice(start, end)).toBe(file.raw);
    }
  });
});
