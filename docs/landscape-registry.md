# Repository landscape registry

The dashboard combines a small strategic registry with repository-owned operational metadata to make the public repository landscape machine-readable without creating duplicate sources of truth.

## Strategic repository tiers

`config/landscape.json` classifies every repository in the current public fleet into exactly one strategic tier:

- `foundation` — low-level contracts, deterministic tooling, and infrastructure intended to support many repositories.
- `shared-platform` — reusable domain or platform capabilities consumed by multiple products, tools, or templates.
- `product` — vertical user-facing applications, services, or specialized tools.
- `lab` — experimental proving grounds where compatibility is not yet promised.
- `template` — canonical starters or reference repositories whose contract is the generated consumer experience.

Tier definitions and their expectations are data in `config/landscape.json`; code only validates the closed set of identifiers.

## Strategic maturity stages

Every registered repository also has exactly one strategic maturity stage:

1. `experiment` — early work whose contract may change freely.
2. `proving` — a real use case exists and the repository is gathering evidence about the right boundary.
3. `reusable` — reuse has been demonstrated and multiple real consumers are expected. Normally this requires at least two genuine consumers or equivalent independently verified reuse.
4. `stable` — the supported contract has strong deterministic validation, compatibility discipline, and representative consumer evidence.
5. `maintenance` — feature growth is intentionally limited while compatibility, security, consolidation, or retirement is managed.

This maturity is a landscape-level decision about reuse and support expectations. It is deliberately separate from coding-tooling's repository-local operational `status` contract.

## Repository-owned operational metadata

When a repository contains `.repository.toml`, coding-tooling remains authoritative for that contract. The dashboard reads the same schema and aggregates only validated evidence:

- `kind`: `library`, `app`, `service`, `lab`, `template`, `infrastructure`, `website`, or `data`;
- `status`: `experimental`, `active`, `stable`, `maintenance`, `retiring`, or `archived`;
- `summary`;
- `depends_on` and `consumed_by` relations;
- `supersedes` and `replaced_by` lifecycle relations.

The dashboard does not infer or rewrite these values. Missing `.repository.toml` is represented as `not-declared`; malformed metadata is `invalid` and contributes no graph edges.

## Dependency graph ownership

The central registry does **not** maintain dependency lists. Repository relationships come from repository-owned contracts.

`.coding-tooling.dependencies.json` owns architecture-layer dependencies. `coding-tooling dependencies audit` remains authoritative for layer direction, cycles, source-development breadth, and canonical ownership.

`.repository.toml` owns higher-level repository relationships and lifecycle links.

This gives three distinct sources with non-overlapping responsibilities:

- `config/landscape.json` owns strategic tier and maturity;
- `.repository.toml` owns operational kind, status, summary, repository relations, and replacement relations;
- `.coding-tooling.dependencies.json` owns architecture-layer dependency declarations.

The collector emits all validated public in-fleet relations under:

```text
site/data/repositories.json -> landscape.graph.edges
```

Targets outside the collected public fleet are omitted from the public graph and counted as `omittedExternalEdges`. The public registry must not contain private repository names.

## Graph nodes

Every collected public repository becomes a graph node. Nodes include:

- strategic tier and maturity;
- repository-owned operational kind, status, and summary when declared;
- coding-tooling architecture layer when declared;
- whether the repository exposes a GitHub Pages workflow;
- its public repository URL.

This keeps unclassified or partially described repositories visible instead of silently removing them from the graph.

## Fail-closed behavior

The registry validator rejects unsupported tiers or maturity stages, malformed definitions, and malformed repository entries.

Dependency architecture evidence is accepted only when the document is schema version 1, names the repository being collected, uses a supported architecture layer, declares a bounded dependency list, and contains unique well-formed dependency entries.

Repository metadata is accepted only when it follows coding-tooling's schema version 1 contract, names the exact repository being collected, uses a supported kind and status, and contains bounded unique repository relations in `owner/repository` form.

Malformed evidence becomes `invalid`; unreadable evidence becomes `unavailable`. Neither state produces graph edges. Higher-priority pipeline or validation failures remain ahead of landscape housekeeping in the action queue.

## Making changes

When the strategic role or maturity of a repository changes, edit `config/landscape.json` and run:

```bash
npm run validate:landscape
npm run validate
```

When operational repository metadata or repository relationships change, update that repository's `.repository.toml` and validate it with coding-tooling.

When architecture-layer dependencies change, update that repository's `.coding-tooling.dependencies.json` and validate it with coding-tooling.

Do not copy either repository-owned relationship set into `config/landscape.json`.
