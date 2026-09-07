# The Deal Desk context schema

This directory **is** the context spec. Every file Deal Desk reads or writes under
`context/` is a Markdown file with typed YAML frontmatter validated against one of the JSON
Schemas here (JSON Schema draft 2020-12). Git is the store — there is no database.

## The two mutability classes

| Class | Where | Rule |
|---|---|---|
| **canonical** | `context/org/**`, `context/legal/**`, `context/demand-gen/**` | Replaced and versioned. Every change goes through PR review. |
| **accumulating** | `context/accounts/**` | Append-only. A meeting note is never rewritten. A superseded artifact is marked `superseded: true`, never deleted. Nothing under `opportunities/**` is ever removed. |

Every file's frontmatter declares its own `mutability`, and each schema pins it with a
`const`. The loader (`@deal-desk/context-core`) enforces the append-only rule; a
protect-paths hook is a second layer over `context/legal/**` and `evals/golden/**`.

## How a file is matched to a schema

By **path convention**, not a `$schema` key in the file. `context-core`'s `classify.ts` maps
a path to a schema type:

| Path | Schema |
|---|---|
| `context/org/company.md` | `org-company.json` |
| `context/org/offerings/*.md` | `org-offering.json` |
| `context/org/pricing.md` | `pricing.json` |
| `context/org/evidence/*.md` | `evidence.json` |
| `context/demand-gen/icp/account.md` | `icp-account.json` |
| `context/demand-gen/icp/buyer.md` | `icp-buyer.json` |
| `context/legal/guidance.md` | `legal-guidance.json` |
| `context/legal/clause-library/*.md` | `clause.json` |
| `context/accounts/*/account.md` | `account.json` |
| `context/accounts/*/people/*.md` | `person.json` |
| `context/accounts/*/opportunities/*/opportunity.md` | `opportunity.json` |
| `context/accounts/*/opportunities/*/meetings/*.md` | `meeting.json` |
| `context/accounts/*/opportunities/*/artifacts/*.md` | `artifact.json` |
| `context/accounts/*/opportunities/*/inbound/*.md` | `inbound.json` |
| `context/accounts/*/opportunities/*/outcomes.jsonl` (per line) | `outcome.json` |

A mis-filed file is a validation error, not a silent pass.

`finding.json` and `retrieval-result.json` are **output-contract** schemas — they validate a
skill's output (`sow-review` findings, `find-evidence` results), not a file on disk. They
live here because the contract is part of the published spec.

## Composition

`frontmatter-common.json` defines `$defs.commonFields` — `fictional` (const `true`),
`mutability`, `schema_version`, `created`, `title`. Every type-specific schema pulls it in
with `allOf: [{ "$ref": "frontmatter-common.json#/$defs/commonFields" }]` and re-declares the
common keys in its own `properties` (as `true`) so `unevaluatedProperties: false` treats them
as evaluated. The net effect: every context file must carry the common fields **and** its
type's fields, and nothing else.

## `schema_version`

Semver of the schema a file was authored against. The loader accepts a file whose
`schema_version` has the same MAJOR as the current `SCHEMA_VERSION` and a MINOR `<=` current.
A MAJOR bump is breaking and requires its own tier-2 change with a corpus-migration PR.
Everything in Phase 0 ships `1.0.0`; there is no migration tooling yet.

## Validate the corpus

```
pnpm corpus:validate
```

Walks every file under `context/`, validates it against its schema, verifies the
`source_hash` of every `inbound/**` file, and cross-checks that each `crm_id` and
`account_slug` equals its directory name. Exit non-zero on any error. Runs in CI.
