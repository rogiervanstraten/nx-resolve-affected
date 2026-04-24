import * as core from '@actions/core'
import * as github from '@actions/github'
import * as path from 'path'
import { GithubDeploymentsAdapter } from './adapters/github-deployments.adapter.js'
import { NxCliAdapter } from './adapters/nx-cli.adapter.js'
import {
  DeployMatrixService,
  computeEnvironment,
  resolveShortNames,
  type MatrixEntry
} from './services/deploy-matrix.service.js'

interface ActionInputs {
  eventName: string
  refName: string
  environment: string
  apps: string[]
  exclude: string[]
  token: string
}

export function splitCsv(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function readInputs(): ActionInputs {
  return {
    eventName: core.getInput('event-name') || github.context.eventName,
    refName: core.getInput('ref-name') || process.env.GITHUB_REF_NAME || '',
    environment: core.getInput('environment'),
    apps: splitCsv(core.getInput('apps')),
    exclude: splitCsv(core.getInput('exclude')),
    token: core.getInput('github-token', { required: true })
  }
}

export function buildDispatchMatrix(
  environment: string,
  apps: string[],
  exclude: string[],
  appsDir: string = path.join(process.cwd(), 'apps')
): MatrixEntry[] {
  const resolved = resolveShortNames(apps, appsDir).filter(
    (app) => !exclude.includes(app)
  )

  return resolved.map((app) => ({ app, environment, base_sha: '' }))
}

async function buildPushMatrix(
  environment: string,
  exclude: string[],
  token: string,
  ref: string
): Promise<MatrixEntry[]> {
  const octokit = github.getOctokit(token)
  const { owner, repo } = github.context.repo
  const service = new DeployMatrixService(
    new GithubDeploymentsAdapter(octokit, owner, repo),
    new NxCliAdapter()
  )
  return service.buildPushMatrix(
    environment,
    exclude,
    (msg) => core.info(msg),
    ref || undefined
  )
}

export async function run(): Promise<void> {
  try {
    const inputs = readInputs()
    const environment = computeEnvironment(
      inputs.eventName,
      inputs.refName,
      inputs.environment
    )

    const matrix =
      inputs.eventName === 'workflow_dispatch'
        ? buildDispatchMatrix(environment, inputs.apps, inputs.exclude)
        : await buildPushMatrix(
            environment,
            inputs.exclude,
            inputs.token,
            inputs.refName
          )

    const json = JSON.stringify(matrix)
    core.info(`Matrix: ${json}`)
    core.setOutput('matrix', json)
    core.setOutput('has-apps', matrix.length > 0 ? 'true' : 'false')
    core.setOutput('environment', environment)
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}
