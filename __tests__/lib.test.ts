import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fs from 'fs'
import {
  computeEnvironment,
  resolveShortNames,
  buildPushMatrix,
  parseInitialCommit
} from '../src/lib.js'

vi.mock('fs')

describe('parseInitialCommit', () => {
  it('returns the single SHA when there is one root commit', () => {
    expect(parseInitialCommit('abc123\n')).toBe('abc123')
  })

  it('returns only the first SHA when there are multiple root commits', () => {
    const multiLine =
      '80708543bcf581bf3a269a1e3cb928ea657057f7\n' +
      '66ce400208aa0ba0b4da17616bb88dbe895af188\n' +
      '1d4674df36a075712c6e8c171981fb8cc7320944\n'
    expect(parseInitialCommit(multiLine)).toBe(
      '80708543bcf581bf3a269a1e3cb928ea657057f7'
    )
  })

  it('handles output with no trailing newline', () => {
    expect(parseInitialCommit('abc123')).toBe('abc123')
  })

  it('strips leading/trailing whitespace', () => {
    expect(parseInitialCommit('  abc123  \n')).toBe('abc123')
  })
})

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
})

describe('buildPushMatrix', () => {
  const noOp = (): void => {}

  it('includes an affected app with its resolved base SHA', async () => {
    const getSha = vi.fn().mockResolvedValue('abc123')
    const getAffected = vi.fn().mockReturnValue(['@acme/web'])

    const result = await buildPushMatrix(
      'staging',
      ['@acme/web'],
      'initial',
      getSha,
      getAffected,
      noOp
    )

    expect(result).toEqual([
      { app: '@acme/web', environment: 'staging', base_sha: 'abc123' }
    ])
    expect(getSha).toHaveBeenCalledWith('staging/web')
    expect(getAffected).toHaveBeenCalledWith('abc123')
  })

  it('falls back to the initial commit when no prior deployment exists', async () => {
    const getSha = vi.fn().mockResolvedValue(null)
    const getAffected = vi.fn().mockReturnValue(['@acme/web'])

    const result = await buildPushMatrix(
      'staging',
      ['@acme/web'],
      'initial-sha',
      getSha,
      getAffected,
      noOp
    )

    expect(result[0].base_sha).toBe('initial-sha')
    expect(getAffected).toHaveBeenCalledWith('initial-sha')
  })

  it('excludes an unaffected app', async () => {
    const getSha = vi.fn().mockResolvedValue('abc123')
    const getAffected = vi.fn().mockReturnValue([])

    const result = await buildPushMatrix(
      'staging',
      ['@acme/web'],
      'initial',
      getSha,
      getAffected,
      noOp
    )

    expect(result).toEqual([])
  })

  it('handles multiple apps independently', async () => {
    const getSha = vi
      .fn()
      .mockResolvedValueOnce('sha-web')
      .mockResolvedValueOnce(null)
    const getAffected = vi
      .fn()
      .mockReturnValueOnce(['@acme/web'])
      .mockReturnValueOnce(['@acme/api'])

    const result = await buildPushMatrix(
      'staging',
      ['@acme/web', '@acme/api'],
      'initial',
      getSha,
      getAffected,
      noOp
    )

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

  it('logs a message when falling back to the initial commit', async () => {
    const getSha = vi.fn().mockResolvedValue(null)
    const getAffected = vi.fn().mockReturnValue([])
    const onInfo = vi.fn()

    await buildPushMatrix(
      'staging',
      ['@acme/web'],
      'initial',
      getSha,
      getAffected,
      onInfo
    )

    expect(onInfo).toHaveBeenCalledWith(expect.stringContaining('staging/web'))
  })
})
