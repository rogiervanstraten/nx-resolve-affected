import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fs from 'fs'
import {
  computeEnvironment,
  resolveShortNames,
  DeployMatrixService
} from '../src/services/deploy-matrix.service.js'
import type { DeploymentsPort } from '../src/ports/deployments.port.js'
import type { NxPort } from '../src/ports/nx.port.js'

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

  function makeService(
    deployments: Partial<DeploymentsPort>,
    nx: Partial<NxPort>
  ): DeployMatrixService {
    return new DeployMatrixService(deployments as DeploymentsPort, nx as NxPort)
  }

  it('includes an affected app with its resolved base SHA', async () => {
    const getLastSuccessfulSha = vi.fn().mockResolvedValue('abc123')
    const getAffectedApps = vi.fn().mockReturnValue(['@acme/web'])

    const service = makeService(
      { getLastSuccessfulSha },
      {
        getAllApps: () => ['@acme/web'],
        getAffectedApps,
        getInitialCommit: () => 'initial'
      }
    )

    const result = await service.buildPushMatrix('staging', [], noOp)

    expect(result).toEqual([
      { app: '@acme/web', environment: 'staging', base_sha: 'abc123' }
    ])
    expect(getLastSuccessfulSha).toHaveBeenCalledWith('staging/web')
    expect(getAffectedApps).toHaveBeenCalledWith('abc123', [])
  })

  it('falls back to the initial commit when no prior deployment exists', async () => {
    const getAffectedApps = vi.fn().mockReturnValue(['@acme/web'])

    const service = makeService(
      { getLastSuccessfulSha: vi.fn().mockResolvedValue(null) },
      {
        getAllApps: () => ['@acme/web'],
        getAffectedApps,
        getInitialCommit: () => 'initial-sha'
      }
    )

    const result = await service.buildPushMatrix('staging', [], noOp)

    expect(result[0].base_sha).toBe('initial-sha')
    expect(getAffectedApps).toHaveBeenCalledWith('initial-sha', [])
  })

  it('excludes an unaffected app', async () => {
    const service = makeService(
      { getLastSuccessfulSha: vi.fn().mockResolvedValue('abc123') },
      {
        getAllApps: () => ['@acme/web'],
        getAffectedApps: () => [],
        getInitialCommit: () => 'initial'
      }
    )

    const result = await service.buildPushMatrix('staging', [], noOp)

    expect(result).toEqual([])
  })

  it('handles multiple apps independently', async () => {
    const getLastSuccessfulSha = vi
      .fn()
      .mockResolvedValueOnce('sha-web')
      .mockResolvedValueOnce(null)
    const getAffectedApps = vi
      .fn()
      .mockReturnValueOnce(['@acme/web'])
      .mockReturnValueOnce(['@acme/api'])

    const service = makeService(
      { getLastSuccessfulSha },
      {
        getAllApps: () => ['@acme/web', '@acme/api'],
        getAffectedApps,
        getInitialCommit: () => 'initial'
      }
    )

    const result = await service.buildPushMatrix('staging', [], noOp)

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({
      app: '@acme/web',
      base_sha: 'sha-web'
    })
    expect(result[1]).toMatchObject({
      app: '@acme/api',
      base_sha: 'initial'
    })
  })

  it('logs the resolved base SHA on the success path', async () => {
    const onInfo = vi.fn()

    const service = makeService(
      { getLastSuccessfulSha: vi.fn().mockResolvedValue('abc123') },
      {
        getAllApps: () => ['@acme/web'],
        getAffectedApps: () => ['@acme/web'],
        getInitialCommit: () => 'initial'
      }
    )

    await service.buildPushMatrix('staging', [], onInfo)

    expect(onInfo).toHaveBeenCalledWith('Base SHA for staging/web: abc123')
  })

  it('returns an empty matrix when there are no apps', async () => {
    const service = makeService(
      { getLastSuccessfulSha: vi.fn() },
      {
        getAllApps: () => [],
        getAffectedApps: () => [],
        getInitialCommit: () => 'initial'
      }
    )

    expect(await service.buildPushMatrix('staging', [], noOp)).toEqual([])
  })

  it('logs a message when falling back to the initial commit', async () => {
    const onInfo = vi.fn()

    const service = makeService(
      { getLastSuccessfulSha: vi.fn().mockResolvedValue(null) },
      {
        getAllApps: () => ['@acme/web'],
        getAffectedApps: () => [],
        getInitialCommit: () => 'initial'
      }
    )

    await service.buildPushMatrix('staging', [], onInfo)

    expect(onInfo).toHaveBeenCalledWith(expect.stringContaining('staging/web'))
  })

  it('propagates the exclude list to NX queries', async () => {
    const getAllApps = vi.fn().mockReturnValue(['@acme/web'])
    const getAffectedApps = vi.fn().mockReturnValue(['@acme/web'])

    const service = makeService(
      { getLastSuccessfulSha: vi.fn().mockResolvedValue('abc123') },
      {
        getAllApps,
        getAffectedApps,
        getInitialCommit: () => 'initial'
      }
    )

    await service.buildPushMatrix('staging', ['@acme/legacy'], noOp)

    expect(getAllApps).toHaveBeenCalledWith(['@acme/legacy'])
    expect(getAffectedApps).toHaveBeenCalledWith('abc123', ['@acme/legacy'])
  })
})
