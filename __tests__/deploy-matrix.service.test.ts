import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fs from 'fs'
import {
  computeEnvironment,
  resolveShortNames,
  DeployMatrixService
} from '../src/services/deploy-matrix.service.js'
import { FakeDeployments, FakeNx } from './fakes.js'

vi.mock('fs')

describe('computeEnvironment', () => {
  it('returns staging for a push to main', () => {
    expect(computeEnvironment('push', 'main', '')).toBe('staging')
  })

  it('returns production for a push to production', () => {
    expect(computeEnvironment('push', 'production', '')).toBe('production')
  })

  it('returns the explicit input on workflow_dispatch regardless of branch', () => {
    expect(computeEnvironment('workflow_dispatch', 'main', 'production')).toBe(
      'production'
    )
    expect(computeEnvironment('workflow_dispatch', 'main', 'staging')).toBe(
      'staging'
    )
  })

  it('treats any non-main branch on push as production', () => {
    expect(computeEnvironment('push', 'feature/foo', '')).toBe('production')
    expect(computeEnvironment('push', 'hotfix', '')).toBe('production')
  })
})

describe('resolveShortNames', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('resolves a short name to the full NX project name', () => {
    vi.mocked(fs.readdirSync).mockReturnValue(['web'] as never)
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ name: '@acme/web' })
    )

    expect(resolveShortNames(['web'], '/apps')).toEqual(['@acme/web'])
  })

  it('accepts a full NX project name directly', () => {
    vi.mocked(fs.readdirSync).mockReturnValue(['web'] as never)
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ name: '@acme/web' })
    )

    expect(resolveShortNames(['@acme/web'], '/apps')).toEqual(['@acme/web'])
  })

  it('excludes apps not in the requested list', () => {
    vi.mocked(fs.readdirSync).mockReturnValue(['web', 'api'] as never)
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync)
      .mockReturnValueOnce(JSON.stringify({ name: '@acme/web' }))
      .mockReturnValueOnce(JSON.stringify({ name: '@acme/api' }))

    expect(resolveShortNames(['web'], '/apps')).toEqual(['@acme/web'])
  })

  it('skips directories that have no project.json', () => {
    vi.mocked(fs.readdirSync).mockReturnValue(['not-an-app'] as never)
    vi.mocked(fs.existsSync).mockReturnValue(false)

    expect(resolveShortNames(['not-an-app'], '/apps')).toEqual([])
  })

  it('returns an empty array when nothing matches', () => {
    vi.mocked(fs.readdirSync).mockReturnValue(['web'] as never)
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ name: '@acme/web' })
    )

    expect(resolveShortNames(['unknown'], '/apps')).toEqual([])
  })

  it('matches an unscoped project name', () => {
    vi.mocked(fs.readdirSync).mockReturnValue(['web'] as never)
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ name: 'web' }))

    expect(resolveShortNames(['web'], '/apps')).toEqual(['web'])
  })

  it('returns an empty array when the requested list is empty', () => {
    vi.mocked(fs.readdirSync).mockReturnValue(['web'] as never)
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ name: '@acme/web' })
    )

    expect(resolveShortNames([], '/apps')).toEqual([])
  })
})

describe('DeployMatrixService.buildPushMatrix', () => {
  const noOp = (): void => {}

  it('includes an affected app with its resolved base SHA', async () => {
    const deployments = new FakeDeployments()
    deployments.record('staging/web', 'abc123')
    const nx = new FakeNx()
    nx.setApps(['@acme/web'])
    nx.setAffected('abc123', ['@acme/web'])

    const result = await new DeployMatrixService(
      deployments,
      nx
    ).buildPushMatrix('staging', [], noOp)

    expect(result).toEqual([
      { app: '@acme/web', environment: 'staging', base_sha: 'abc123' }
    ])
  })

  it('falls back to the initial commit when no prior deployment exists', async () => {
    const nx = new FakeNx()
    nx.setApps(['@acme/web'])
    nx.setInitialCommit('initial-sha')
    nx.setAffected('initial-sha', ['@acme/web'])

    const result = await new DeployMatrixService(
      new FakeDeployments(),
      nx
    ).buildPushMatrix('staging', [], noOp)

    expect(result).toEqual([
      { app: '@acme/web', environment: 'staging', base_sha: 'initial-sha' }
    ])
  })

  it('excludes an unaffected app', async () => {
    const deployments = new FakeDeployments()
    deployments.record('staging/web', 'abc123')
    const nx = new FakeNx()
    nx.setApps(['@acme/web'])

    const result = await new DeployMatrixService(
      deployments,
      nx
    ).buildPushMatrix('staging', [], noOp)

    expect(result).toEqual([])
  })

  it('handles multiple apps independently', async () => {
    const deployments = new FakeDeployments()
    deployments.record('staging/web', 'sha-web')
    const nx = new FakeNx()
    nx.setApps(['@acme/web', '@acme/api'])
    nx.setAffected('sha-web', ['@acme/web'])
    nx.setAffected('initial', ['@acme/api'])

    const result = await new DeployMatrixService(
      deployments,
      nx
    ).buildPushMatrix('staging', [], noOp)

    expect(result).toEqual([
      { app: '@acme/web', environment: 'staging', base_sha: 'sha-web' },
      { app: '@acme/api', environment: 'staging', base_sha: 'initial' }
    ])
  })

  it('logs the resolved base SHA on the success path', async () => {
    const deployments = new FakeDeployments()
    deployments.record('staging/web', 'abc123')
    const nx = new FakeNx()
    nx.setApps(['@acme/web'])
    nx.setAffected('abc123', ['@acme/web'])
    const onInfo = vi.fn()

    await new DeployMatrixService(deployments, nx).buildPushMatrix(
      'staging',
      [],
      onInfo
    )

    expect(onInfo).toHaveBeenCalledWith('Base SHA for staging/web: abc123')
  })

  it('returns an empty matrix when there are no apps', async () => {
    const result = await new DeployMatrixService(
      new FakeDeployments(),
      new FakeNx()
    ).buildPushMatrix('staging', [], noOp)

    expect(result).toEqual([])
  })

  it('logs a message when falling back to the initial commit', async () => {
    const nx = new FakeNx()
    nx.setApps(['@acme/web'])
    const onInfo = vi.fn()

    await new DeployMatrixService(new FakeDeployments(), nx).buildPushMatrix(
      'staging',
      [],
      onInfo
    )

    expect(onInfo).toHaveBeenCalledWith(expect.stringContaining('staging/web'))
  })

  it('picks the latest deploy on the matching ref and ignores other refs', async () => {
    const deployments = new FakeDeployments()
    deployments.record('staging/web', 'feature-sha', { ref: 'feature/x' })
    deployments.record('staging/web', 'main-sha', { ref: 'main' })
    const nx = new FakeNx()
    nx.setApps(['@acme/web'])
    nx.setAffected('main-sha', ['@acme/web'])

    const result = await new DeployMatrixService(
      deployments,
      nx
    ).buildPushMatrix('staging', [], noOp, 'main')

    expect(result[0].base_sha).toBe('main-sha')
  })

  it('falls back to initial commit when no deploy matches the ref', async () => {
    const deployments = new FakeDeployments()
    deployments.record('staging/web', 'feature-sha', { ref: 'feature/x' })
    const nx = new FakeNx()
    nx.setApps(['@acme/web'])
    nx.setInitialCommit('init')
    nx.setAffected('init', ['@acme/web'])

    const result = await new DeployMatrixService(
      deployments,
      nx
    ).buildPushMatrix('staging', [], noOp, 'main')

    expect(result[0].base_sha).toBe('init')
  })

  it('accepts a deploy from any ref when no ref filter is provided', async () => {
    const deployments = new FakeDeployments()
    deployments.record('staging/web', 'any-sha', { ref: 'feature/x' })
    const nx = new FakeNx()
    nx.setApps(['@acme/web'])
    nx.setAffected('any-sha', ['@acme/web'])

    const result = await new DeployMatrixService(
      deployments,
      nx
    ).buildPushMatrix('staging', [], noOp)

    expect(result[0].base_sha).toBe('any-sha')
  })

  it('drops excluded apps from the matrix', async () => {
    const deployments = new FakeDeployments()
    deployments.record('staging/web', 'abc123')
    deployments.record('staging/legacy', 'def456')
    const nx = new FakeNx()
    nx.setApps(['@acme/web', '@acme/legacy'])
    nx.setAffected('abc123', ['@acme/web'])
    nx.setAffected('def456', ['@acme/legacy'])

    const result = await new DeployMatrixService(
      deployments,
      nx
    ).buildPushMatrix('staging', ['@acme/legacy'], noOp)

    expect(result).toEqual([
      { app: '@acme/web', environment: 'staging', base_sha: 'abc123' }
    ])
  })
})
