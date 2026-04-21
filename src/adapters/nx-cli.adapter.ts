import { execSync } from 'child_process'
import type { NxPort } from '../ports/nx.port.js'

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

export class NxCliAdapter implements NxPort {
  private excludeFlag(exclude: string[]): string {
    return exclude.length ? ` --exclude=${exclude.join(',')}` : ''
  }

  getAllApps(exclude: string[]): string[] {
    return JSON.parse(
      execSync(
        `pnpm nx show projects --type=app --json${this.excludeFlag(exclude)}`,
        { encoding: 'utf8' }
      )
    )
  }

  getAffectedApps(baseSha: string, exclude: string[]): string[] {
    return JSON.parse(
      execSync(
        `pnpm nx show projects --affected --base=${baseSha} --head=HEAD --type=app --json${this.excludeFlag(exclude)}`,
        { encoding: 'utf8' }
      )
    )
  }

  getInitialCommit(): string {
    return parseInitialCommit(
      execSync('git rev-list --max-parents=0 HEAD', { encoding: 'utf8' })
    )
  }
}
