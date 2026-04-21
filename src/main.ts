import * as core from '@actions/core'
import * as github from '@actions/github'
import { execSync } from 'child_process'
import * as path from 'path'
import {
  computeEnvironment,
  resolveShortNames,
  buildPushMatrix,
  parseInitialCommit,
  type MatrixEntry
} from './lib.js'

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

async function getLastSuccessfulSha(
  octokit: ReturnType<typeof github.getOctokit>,
  owner: string,
  repo: string,
  envName: string
): Promise<string | null> {
  const result = await octokit.graphql<DeploymentQueryResult>(
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
    { owner, name: repo, env: envName }
  )

  const node = result.repository.deployments.nodes.find(
    (n) => n.latestStatus?.state === 'SUCCESS'
  )

  return node?.commitOid ?? null
}

function excludeFlag(exclude: string[]): string {
  return exclude.length ? ` --exclude=${exclude.join(',')}` : ''
}

function getAllApps(exclude: string[]): string[] {
  return JSON.parse(
    execSync(`pnpm nx show projects --type=app --json${excludeFlag(exclude)}`, {
      encoding: 'utf8'
    })
  )
}

function getAffectedApps(baseSha: string, exclude: string[]): string[] {
  return JSON.parse(
    execSync(
      `pnpm nx show projects --affected --base=${baseSha} --head=HEAD --type=app --json${excludeFlag(exclude)}`,
      { encoding: 'utf8' }
    )
  )
}

export async function run(): Promise<void> {
  const eventName = core.getInput('event-name', { required: true })
  const refName = core.getInput('ref-name', { required: true })
  const envInput = core.getInput('environment')
  const appsInput = core.getInput('apps')
  const excludeInput = core.getInput('exclude')
  const token = core.getInput('github-token', { required: true })

  const environment = computeEnvironment(eventName, refName, envInput)
  const exclude = excludeInput
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  let matrix: MatrixEntry[]

  if (eventName === 'workflow_dispatch') {
    const requested = appsInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const apps = resolveShortNames(
      requested,
      path.join(process.cwd(), 'apps')
    ).filter((app) => !exclude.includes(app))
    matrix = apps.map((app) => ({ app, environment, base_sha: '' }))
  } else {
    const octokit = github.getOctokit(token)
    const { owner, repo } = github.context.repo
    const initialCommit = parseInitialCommit(
      execSync('git rev-list --max-parents=0 HEAD', { encoding: 'utf8' })
    )

    matrix = await buildPushMatrix(
      environment,
      getAllApps(exclude),
      initialCommit,
      (envName) => getLastSuccessfulSha(octokit, owner, repo, envName),
      (baseSha) => getAffectedApps(baseSha, exclude),
      (msg) => core.info(msg)
    )
  }

  const json = JSON.stringify(matrix)
  core.info(`Matrix: ${json}`)
  core.setOutput('matrix', json)
  core.setOutput('has-apps', matrix.length > 0 ? 'true' : 'false')
  core.setOutput('environment', environment)
}
