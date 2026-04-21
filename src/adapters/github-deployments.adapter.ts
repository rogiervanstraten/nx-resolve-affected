import * as github from '@actions/github'
import type { DeploymentsPort } from '../ports/deployments.port.js'

interface DeploymentQueryResult {
  repository: {
    deployments: {
      nodes: Array<{
        commitOid: string
        latestStatus: { state: string } | null
      }>
    }
  }
}

export class GithubDeploymentsAdapter implements DeploymentsPort {
  constructor(
    private readonly octokit: ReturnType<typeof github.getOctokit>,
    private readonly owner: string,
    private readonly repo: string
  ) {}

  async getLastSuccessfulSha(envName: string): Promise<string | null> {
    const result = await this.octokit.graphql<DeploymentQueryResult>(
      `
      query($owner: String!, $name: String!, $env: String!) {
        repository(owner: $owner, name: $name) {
          deployments(
            environments: [$env]
            first: 10
            orderBy: { field: CREATED_AT, direction: DESC }
          ) {
            nodes {
              commitOid
              latestStatus { state }
            }
          }
        }
      }
    `,
      { owner: this.owner, name: this.repo, env: envName }
    )

    const node = result.repository.deployments.nodes.find(
      (n) => n.latestStatus?.state === 'SUCCESS'
    )

    return node?.commitOid ?? null
  }
}
