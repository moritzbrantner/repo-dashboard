# Repository landscape registry

The dashboard keeps repository lifecycle metadata in `config/landscape.json` and derives dependency edges from repository-owned architecture declarations.

The goal is to make the repository landscape machine-readable without turning the dashboard into a second owner for facts that already belong elsewhere.

## Repository tiers

Every registered repository has exactly one tier:

- `foundation` — low-level contracts, deterministic tooling, and infrastructure intended to support many repositories.
- `shared-platform` — reusable domain or platform capabilities consumed by multiple products, tools, or templates.
- `product` — vertical user-facing applications, services, or specialized tools.
- `lab` — experimental proving grounds where compatibility is not yet promised.
- `template` — canonical starters or reference repositories whose contract is the generated consumer experience.

Tier definitions and their expectations are data in `config/landscape.json`; code only validates the closed set of identifiers.

## Maturity stages

Every registered repository also has exactly one maturity stage:

1. `experiment` — early work whose contract may change freely.
2. `proving` — a real use case exists and the repository is gathering evidence about the right boundary.
3. `reusable` — reuse has been demonstrated and multiple real consumers are expected. Normally this requires at least two genuine consumers or equivalent independently verified reuse.
4. `stable` — the supported contract has strong deterministic validation, compatibility discipline, and representative consumer evidence.
5. `maintenance` — feature growth is intentionally limited while compatibility, security, consolidation, or retirement is managed.

Maturity is an explicit lifecycle decision, not a score inferred from commit frequency or repository age.

## Dependency graph ownership

The central registry does **not** maintain dependency lists. A dependency belongs to the repository that consumes it, using the existing coding-tooling contract:

```text
.coding-tooling.dependencies.json
```

`coding-tooling dependencies audit` remains authoritative for architecture rules such as layer direction, cycles, source-development breadth, and canonical ownership. The dashboard only sanitizes the declared direct dependency envelope and aggregates it into the fleet snapshot.

This avoids two dependency sources of truth:

- `config/landscape.json` owns tier and maturity metadata.
- each repository's `.coding-tooling.dependencies.json` owns its declared repository dependencies.

The collector emits public in-fleet dependency edges under:

```text
site/data/repositories.json -> landscape.graph.edges
```

Targets outside the collected public fleet are omitted from the public graph and counted as `omittedExternalEdges`. The public registry must not contain private repository names.

## Fail-closed behavior

The registry validator rejects unsupported tiers or maturity stages, malformed definitions, and malformed repository entries.

Dependency architecture evidence is accepted only when the document is schema version 1, names the repository being collected, uses a supported architecture layer, declares a bounded dependency list, and contains unique well-formed dependency entries. Malformed evidence becomes `invalid`; unreadable evidence becomes `unavailable`. Neither state produces dependency edges.

An unregistered repository remains visible in the fleet but gets no invented tier or maturity. Once higher-priority pipeline, foundation, or contract remediation is clear, the action queue can surface `Classify repository tier and maturity` as the next lifecycle task.

## Snapshot shape

Each repository receives a `landscape` object containing:

- whether it is registered;
- its tier and maturity, or `null` when intentionally unknown;
- its dependency architecture state, architecture layer, and sanitized direct dependencies.

The top-level `landscape` object contains the aggregate summary and a deterministic node/edge graph. Nodes include every collected public repository so missing classifications remain visible instead of disappearing from the model.

## Making changes

When a repository's lifecycle role changes, edit `config/landscape.json` and run:

```bash
npm run validate:landscape
npm run validate
```

When a repository gains or changes a cross-repository dependency, update that repository's `.coding-tooling.dependencies.json` and validate it with coding-tooling. Do not add the dependency to `config/landscape.json`.
