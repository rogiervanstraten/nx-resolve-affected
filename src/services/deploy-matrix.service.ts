import * as fs from 'fs'
import * as path from 'path'
import type { DeploymentsPort } from '../ports/deployments.port.js'
import type { NxPort } from '../ports/nx.port.js'

export interface MatrixEntry {
  app: string
  environment: string
  base_sha: string
}

/**
 * Derives the target environment from the GitHub event context.
 * On workflow_dispatch the caller supplies it explicitly; on push it is
 * inferred from the branch name.
 */
export function computeEnvironment(
  eventName: string,
  refName: string,
  envInput: string
): string {
  if (eventName === 'workflow_dispatch') return envInput
  return refName === 'main' ? 'staging' : 'production'
}

/**
 * Maps a list of short app names (e.g. "web") or full NX project names
 * (e.g. "@acme/web") to their canonical NX project names by scanning
 * project.json files under appsDir.
 */
export function resolveShortNames(
  requested: string[],
  appsDir: string
): string[] {
  const resolved: string[] = []

  for (const dir of fs.readdirSync(appsDir) as string[]) {
    const pjsonPath = path.join(appsDir, dir, 'project.json')
    if (!fs.existsSync(pjsonPath)) continue
    const { name } = JSON.parse(fs.readFileSync(pjsonPath, 'utf8')) as {
      name: string
    }
    const short = name.replace(/^@[^/]+\//, '')
    if (requested.includes(short) || requested.includes(name)) {
      resolved.push(name)
    }
  }

  return resolved
}

export class DeployMatrixService {
  constructor(
    private readonly deployments: DeploymentsPort,
    private readonly nx: NxPort
  ) {}

  /**
   * Builds the deploy matrix for a push event.
   *
   * For each app, queries the last successful deployment SHA, then asks NX
   * whether the app is affected since that SHA. Only affected apps are
   * included. When no prior deployment exists, falls back to the repo's
   * initial commit.
   */
  async buildPushMatrix(
    environment: string,
    exclude: string[],
    onInfo: (msg: string) => void
  ): Promise<MatrixEntry[]> {
    const allApps = this.nx.getAllApps(exclude)
    const initialCommit = this.nx.getInitialCommit()
    const matrix: MatrixEntry[] = []

    for (const app of allApps) {
      const short = app.replace(/^@[^/]+\//, '')
      const envName = `${environment}/${short}`

      let baseSha = await this.deployments.getLastSuccessfulSha(envName)
      if (!baseSha) {
        onInfo(`No successful deployment for ${envName}, using initial commit`)
        baseSha = initialCommit
      } else {
        onInfo(`Base SHA for ${envName}: ${baseSha}`)
      }

      if (this.nx.getAffectedApps(baseSha, exclude).includes(app)) {
        matrix.push({ app, environment, base_sha: baseSha })
      }
    }

    return matrix
  }
}
