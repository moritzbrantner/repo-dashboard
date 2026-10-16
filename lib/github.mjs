// One GitHub API transport for all server-side reads and writes.
export class GitHubClient {
  constructor({ token = process.env.GITHUB_TOKEN, apiBase = "https://api.github.com" } = {}) {
    this.token = token || null;
    this.apiBase = apiBase.replace(/\/$/, "");
  }

  async request(path, { optional = false, method = "GET", body } = {}) {
    if (!path.startsWith("/") || path.startsWith("//")) throw new Error("Invalid GitHub API path.");
    const headers = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "repo-dashboard/1.0",
    };
    if (this.token) headers.Authorization = "Bearer " + this.token;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(this.apiBase + path, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (optional && (response.status === 404 || response.status === 403)) return null;
    if (!response.ok) {
      const remaining = response.headers.get("x-ratelimit-remaining");
      throw new Error("GitHub " + response.status + " for " + path +
        (remaining === "0" ? " (rate limit exhausted)" : ""));
    }
    return response.status === 204 ? null : response.json();
  }

  async listOwnedRepositories(owner) {
    const repositories = [];
    for (let page = 1; ; page += 1) {
      const batch = await this.request("/user/repos?affiliation=owner&visibility=all&sort=updated&per_page=100&page=" + page);
      repositories.push(...batch.filter((repo) => repo.owner?.login?.toLowerCase() === owner.toLowerCase()));
      if (batch.length < 100) break;
    }
    return repositories;
  }

  tree(owner, repo, branch) {
    return this.request("/repos/" + owner + "/" + repo + "/git/trees/" +
      encodeURIComponent(branch) + "?recursive=1", { optional: true });
  }
}
