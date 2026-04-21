import * as fs from 'fs'
import * as path from 'path'

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

/**
 * Extracts the first SHA from the output of `git rev-list --max-parents=0 HEAD`.
 *
 * A repo with multiple independent root commits (e.g. created via git subtree
 * or import) returns one SHA per line. Using the raw multi-line string as a
 * `--base=` argument breaks the shell command, so we take only the first line.
 */
export function parseInitialCommit(gitOutput: string): string {
  return gitOutput.trim().split('\n')[0]
}

/**
 * Builds the deploy matrix for a push event.
 *
 * For each app, calls getSha to find the last successful deployment SHA, then
 * calls getAffected to determine which apps changed since that SHA. Only apps
 * that are affected are included in the returned matrix.
 *
 * Accepts injected getSha / getAffected / onInfo to keep the function pure and
 * testable without mocking module-level side effects.
 */
export async function buildPushMatrix(
  environment: string,
  allApps: string[],
  initialCommit: string,
  getSha: (envName: string) => Promise<string | null>,
  getAffected: (baseSha: string) => string[],
  onInfo: (msg: string) => void
): Promise<MatrixEntry[]> {
  const matrix: MatrixEntry[] = []

  for (const app of allApps) {
    const short = app.replace(/^@[^/]+\//, '')
    const envName = `${environment}/${short}`

    let baseSha = await getSha(envName)
    if (!baseSha) {
      onInfo(`No successful deployment for ${envName}, using initial commit`)
      baseSha = initialCommit
    } else {
      onInfo(`Base SHA for ${envName}: ${baseSha}`)
    }

    if (getAffected(baseSha).includes(app)) {
      matrix.push({ app, environment, base_sha: baseSha })
    }
  }

  return matrix
}
