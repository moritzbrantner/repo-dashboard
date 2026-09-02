import { GitHubClient } from "./github.mjs";

export class FleetGitHubClient extends GitHubClient {
  async listOwnedRepositories(owner) {
    try {
      return await super.listOwnedRepositories(owner);
    } catch (error) {
      const repositoryScopedToken = this.token && error instanceof Error && error.message.includes("GitHub 403 for /user/repos");
      if (!repositoryScopedToken) throw error;

      const token = this.token;
      this.token = null;
      try {
        return await super.listOwnedRepositories(owner);
      } finally {
        this.token = token;
      }
    }
  }
}
