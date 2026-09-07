import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parse as parseYaml } from "yaml";
import ajv2020Module from "ajv/dist/2020.js";
import type { SkillDefinition } from "@deal-desk/context-core";

const Ajv2020 = ((ajv2020Module as unknown as { default?: unknown }).default ??
  ajv2020Module) as unknown as typeof import("ajv/dist/2020.js").default;

/** Walk up from this module to the package root (the dir containing package.json). */
function packageRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, "package.json"))) return dir;
    dir = dirname(dir);
  }
  throw new Error("could not locate @deal-desk/skills package root");
}

const ROOT = packageRoot();
const DEFINITIONS_DIR = join(ROOT, "src/definitions");
const SCHEMA_PATH = join(ROOT, "src/skill-def.schema.json");

let cache: Map<string, SkillDefinition> | null = null;

async function loadRegistry(): Promise<Map<string, SkillDefinition>> {
  if (cache) return cache;

  const schemaText = await readFile(SCHEMA_PATH, "utf8");
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(JSON.parse(schemaText) as object);

  const files = (await readdir(DEFINITIONS_DIR)).filter((f) => f.endsWith(".yaml")).sort();
  const map = new Map<string, SkillDefinition>();

  for (const file of files) {
    const text = await readFile(join(DEFINITIONS_DIR, file), "utf8");
    const def = parseYaml(text) as SkillDefinition;
    if (!validate(def)) {
      const issues = (validate.errors ?? [])
        .map(
          (e: { instancePath?: string; message?: string }) =>
            `${e.instancePath || "(root)"} ${e.message ?? ""}`,
        )
        .join("; ");
      throw new Error(`skill definition ${file} is invalid: ${issues}`);
    }
    if (def.id !== file.replace(/\.yaml$/, "")) {
      throw new Error(`skill definition ${file} declares id "${def.id}" — must match the filename`);
    }
    if (def.tier === "review" && def.context_grants.write !== undefined) {
      throw new Error(
        `skill definition ${file}: review-tier skills must not declare a write grant`,
      );
    }
    map.set(def.id, def);
  }

  cache = map;
  return map;
}

/** Reset the module cache (tests). */
export function _resetRegistryCache(): void {
  cache = null;
}

export async function loadSkill(id: string): Promise<SkillDefinition> {
  const map = await loadRegistry();
  const def = map.get(id);
  if (!def) {
    throw new Error(`unknown skill "${id}" (have: ${[...map.keys()].join(", ")})`);
  }
  return def;
}

export async function listSkills(): Promise<SkillDefinition[]> {
  return [...(await loadRegistry()).values()];
}
