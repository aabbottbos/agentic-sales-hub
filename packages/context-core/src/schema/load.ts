import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createRegistry, type SchemaRegistry } from "./registry.js";

/**
 * Load every `*.json` schema from `schemaDir` and compile them into a registry.
 * `schemaDir` is normally `<contextRoot>/schema`.
 */
export async function loadSchemas(schemaDir: string): Promise<SchemaRegistry> {
  const entries = await readdir(schemaDir);
  const jsonFiles = entries.filter((f) => f.endsWith(".json")).sort();
  if (jsonFiles.length === 0) {
    throw new Error(`no *.json schemas found in ${schemaDir}`);
  }
  const schemas = await Promise.all(
    jsonFiles.map(async (f) => {
      const text = await readFile(join(schemaDir, f), "utf8");
      try {
        return JSON.parse(text) as Record<string, unknown>;
      } catch (e) {
        throw new Error(`${f} is not valid JSON: ${(e as Error).message}`);
      }
    }),
  );
  return createRegistry(schemas);
}
