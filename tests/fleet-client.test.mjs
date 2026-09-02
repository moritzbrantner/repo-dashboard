import test from "node:test";
import assert from "node:assert/strict";
import { FleetGitHubClient } from "../lib/fleet-client.mjs";

test("repository-scoped token falls back to public owner listing and is restored", async () => {
  const calls = [];
  const client = new FleetGitHubClient({ token: "repository-token" });
  client.request = async (path) => {
    calls.push({ path, token: client.token });
    if (path.startsWith("/user/repos")) throw new Error(`GitHub 403 for ${path}`);
    return [{ name: "repo-dashboard", owner: { login: "moritzbrantner" } }];
  };

  const repositories = await client.listOwnedRepositories("moritzbrantner");

  assert.equal(repositories.length, 1);
  assert.equal(calls[0].token, "repository-token");
  assert.equal(calls[1].token, null);
  assert.match(calls[1].path, /^\/users\/moritzbrantner\/repos/);
  assert.equal(client.token, "repository-token");
});

test("non-scope failures are not hidden by the fallback", async () => {
  const client = new FleetGitHubClient({ token: "repository-token" });
  client.request = async () => { throw new Error("GitHub 500 for /user/repos"); };
  await assert.rejects(() => client.listOwnedRepositories("moritzbrantner"), /GitHub 500/);
});
