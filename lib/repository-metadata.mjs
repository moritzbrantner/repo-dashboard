export const REPOSITORY_KINDS = Object.freeze([
  "library",
  "app",
  "service",
  "lab",
  "template",
  "infrastructure",
  "website",
  "data",
]);

export const REPOSITORY_STATUSES = Object.freeze([
  "experimental",
  "active",
  "stable",
  "maintenance",
  "retiring",
  "archived",
]);

const FULL_REPOSITORY_NAME = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const MAX_RELATIONS = 64;

function stringField(source, name) {
  const match = source.match(new RegExp(`^\\s*${name}\\s*=\\s*"((?:\\\\.|[^"])*)"\\s*$`, "m"));
  if (!match) return undefined;
  try {
    return JSON.parse(`"${match[1]}"`);
  } catch {
    return undefined;
  }
}

function numberField(source, name) {
  const match = source.match(new RegExp(`^\\s*${name}\\s*=\\s*(\\d+)\\s*$`, "m"));
  return match ? Number(match[1]) : undefined;
}

function stringArrayField(source, name) {
  const match = source.match(new RegExp(`^\\s*${name}\\s*=\\s*\\[([\\s\\S]*?)\\]`, "m"));
  if (!match) return [];
  const values = match[1].match(/"(?:\\.|[^"])*"/g) ?? [];
  try {
    return values.map((value) => JSON.parse(value));
  } catch {
    return null;
  }
}

function invalid(reason) {
  return {
    state: "invalid",
    kind: null,
    status: null,
    summary: null,
    dependsOn: [],
    consumedBy: [],
    supersedes: [],
    replacedBy: [],
    reason,
  };
}

function validateRelations(name, values) {
  if (!Array.isArray(values)) return `${name} must be an array of strings`;
  if (values.length > MAX_RELATIONS) return `${name} exceeds the dashboard safety limit`;
  if (values.some((value) => typeof value !== "string" || !FULL_REPOSITORY_NAME.test(value))) {
    return `${name} entries must use owner/repository form`;
  }
  if (new Set(values).size !== values.length) return `${name} contains duplicate repositories`;
  return null;
}

export function parseRepositoryMetadata(text, owner, repositoryName) {
  if (typeof text !== "string" || text.length === 0) return null;

  const schemaVersion = numberField(text, "schema_version");
  const id = stringField(text, "id");
  const kind = stringField(text, "kind");
  const status = stringField(text, "status");
  const summary = stringField(text, "summary") ?? null;
  const dependsOn = stringArrayField(text, "depends_on");
  const consumedBy = stringArrayField(text, "consumed_by");
  const supersedes = stringArrayField(text, "supersedes");
  const replacedBy = stringArrayField(text, "replaced_by");

  if (schemaVersion !== 1) return invalid("schema_version must be 1");
  const expectedId = `${owner}/${repositoryName}`;
  if (id !== expectedId) return invalid(`id must be ${expectedId}`);
  if (!REPOSITORY_KINDS.includes(kind)) return invalid(`kind must be one of ${REPOSITORY_KINDS.join(", ")}`);
  if (!REPOSITORY_STATUSES.includes(status)) {
    return invalid(`status must be one of ${REPOSITORY_STATUSES.join(", ")}`);
  }

  for (const [name, values] of [
    ["depends_on", dependsOn],
    ["consumed_by", consumedBy],
    ["supersedes", supersedes],
    ["replaced_by", replacedBy],
  ]) {
    const reason = validateRelations(name, values);
    if (reason) return invalid(reason);
  }

  return {
    state: "declared",
    kind,
    status,
    summary,
    dependsOn: [...dependsOn].sort(),
    consumedBy: [...consumedBy].sort(),
    supersedes: [...supersedes].sort(),
    replacedBy: [...replacedBy].sort(),
  };
}
