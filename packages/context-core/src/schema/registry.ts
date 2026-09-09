import ajv2020Module from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv";
import addFormatsModule from "ajv-formats";

// ajv/dist/2020 and ajv-formats are CJS; under NodeNext + verbatimModuleSyntax the
// callable/constructable value is on `.default` (with a further `.default` fallback
// depending on how the interop shakes out at runtime).
const Ajv2020 = ((ajv2020Module as unknown as { default?: unknown }).default ??
  ajv2020Module) as unknown as typeof import("ajv/dist/2020.js").default;
const addFormats = ((addFormatsModule as unknown as { default?: unknown }).default ??
  addFormatsModule) as unknown as typeof import("ajv-formats").default;

/**
 * Current context-schema version. A file is accepted if its `schema_version` has
 * this MAJOR and a MINOR <= this MINOR. A MAJOR bump is breaking (own tier-2 + a
 * corpus-migration PR). See context/schema/README.md.
 */
export const SCHEMA_VERSION = "1.0.0";

/** Schema types keyed by the `$id` basename (without `.json`). */
export const SCHEMA_TYPES = [
  "frontmatter-common",
  "org-company",
  "org-offering",
  "pricing",
  "evidence",
  "legal-guidance",
  "clause",
  "icp-account",
  "icp-buyer",
  "account",
  "person",
  "opportunity",
  "meeting",
  "artifact",
  "inbound",
  "outcome",
  "finding",
  "retrieval-result",
] as const;

export type SchemaType = (typeof SCHEMA_TYPES)[number];

const ID_BASE = "https://agentic-sales-hub.dev/schema/";

export interface SchemaRegistry {
  /** Get the compiled validator for a schema type. Throws if unknown. */
  get(type: string): ValidateFunction;
  /** Every schema type that has a compiled validator. */
  types(): readonly string[];
}

interface RawSchema {
  $id?: string;
  [k: string]: unknown;
}

/**
 * Build a registry from a set of raw schema objects (as read from
 * `context/schema/*.json`). Compiles every schema up front so a malformed schema
 * fails fast rather than on first use.
 */
export function createRegistry(schemas: RawSchema[]): SchemaRegistry {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);

  for (const schema of schemas) {
    if (typeof schema.$id !== "string") {
      throw new Error(`schema is missing a string $id: ${JSON.stringify(schema).slice(0, 120)}`);
    }
    ajv.addSchema(schema, schema.$id);
  }

  const validators = new Map<string, ValidateFunction>();
  for (const schema of schemas) {
    const id = schema.$id as string;
    const type = id.startsWith(ID_BASE) ? id.slice(ID_BASE.length, -".json".length) : id;
    const validate = ajv.getSchema(id);
    if (!validate) {
      throw new Error(`failed to compile schema ${id}`);
    }
    validators.set(type, validate);
  }

  return {
    get(type: string): ValidateFunction {
      const v = validators.get(type);
      if (!v) {
        throw new Error(
          `unknown schema type "${type}" (have: ${[...validators.keys()].join(", ")})`,
        );
      }
      return v;
    },
    types(): readonly string[] {
      return [...validators.keys()];
    },
  };
}

/** True if `fileVersion` is acceptable against `SCHEMA_VERSION`. */
export function isSchemaVersionAccepted(fileVersion: string, current = SCHEMA_VERSION): boolean {
  const parse = (v: string): [number, number, number] | null => {
    const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  };
  const f = parse(fileVersion);
  const c = parse(current);
  if (!f || !c) return false;
  return f[0] === c[0] && f[1] <= c[1];
}
