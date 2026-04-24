import type { DeploymentsPort } from '../src/ports/deployments.port.js'
import type { NxPort } from '../src/ports/nx.port.js'

export type DeploymentState = 'SUCCESS' | 'FAILURE' | 'IN_PROGRESS'

interface DeploymentRecord {
  env: string
  sha: string
  ref?: string
  state: DeploymentState
}

export class FakeDeployments implements DeploymentsPort {
  private readonly records: DeploymentRecord[] = []

  record(
    env: string,
    sha: string,
    opts: { ref?: string; state?: DeploymentState } = {}
  ): void {
    this.records.push({
      env,
      sha,
      ref: opts.ref,
      state: opts.state ?? 'SUCCESS'
    })
  }

  async getLastSuccessfulSha(
    envName: string,
    ref?: string
  ): Promise<string | null> {
    for (let i = this.records.length - 1; i >= 0; i--) {
      const r = this.records[i]
      if (
        r.env === envName &&
        r.state === 'SUCCESS' &&
        (ref === undefined || r.ref === ref)
      ) {
        return r.sha
      }
    }
    return null
  }
}

export class FakeNx implements NxPort {
  private apps: string[] = []
  private readonly affected = new Map<string, string[]>()
  private initialCommit = 'initial'

  setApps(apps: string[]): void {
    this.apps = apps
  }

  setAffected(baseSha: string, apps: string[]): void {
    this.affected.set(baseSha, apps)
  }

  setInitialCommit(sha: string): void {
    this.initialCommit = sha
  }

  getAllApps(exclude: string[]): string[] {
    return this.apps.filter((a) => !exclude.includes(a))
  }

  getAffectedApps(baseSha: string, exclude: string[]): string[] {
    return (this.affected.get(baseSha) ?? []).filter(
      (a) => !exclude.includes(a)
    )
  }

  getInitialCommit(): string {
    return this.initialCommit
  }
}
