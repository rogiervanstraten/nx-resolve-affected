import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fs from 'fs'
import { splitCsv, buildDispatchMatrix } from '../src/main.js'

vi.mock('fs')

describe('splitCsv', () => {
  it('splits a comma-separated list', () => {
    expect(splitCsv('a,b,c')).toEqual(['a', 'b', 'c'])
  })

  it('trims whitespace around each value', () => {
    expect(splitCsv('a, b ,  c')).toEqual(['a', 'b', 'c'])
  })

  it('drops empty segments', () => {
    expect(splitCsv('a,,b,')).toEqual(['a', 'b'])
  })

  it('returns an empty array for an empty string', () => {
    expect(splitCsv('')).toEqual([])
  })

  it('returns an empty array for whitespace-only input', () => {
    expect(splitCsv('  ,  ,  ')).toEqual([])
  })
})

describe('buildDispatchMatrix', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('resolves requested apps and maps them to matrix entries', () => {
    vi.mocked(fs.readdirSync).mockReturnValue(['web', 'api'] as never)
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync)
      .mockReturnValueOnce(JSON.stringify({ name: '@acme/web' }))
      .mockReturnValueOnce(JSON.stringify({ name: '@acme/api' }))

    expect(buildDispatchMatrix('staging', ['web', 'api'], [], '/apps')).toEqual(
      [
        { app: '@acme/web', environment: 'staging', base_sha: '' },
        { app: '@acme/api', environment: 'staging', base_sha: '' }
      ]
    )
  })

  it('filters out apps listed in exclude', () => {
    vi.mocked(fs.readdirSync).mockReturnValue(['web', 'api'] as never)
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync)
      .mockReturnValueOnce(JSON.stringify({ name: '@acme/web' }))
      .mockReturnValueOnce(JSON.stringify({ name: '@acme/api' }))

    const result = buildDispatchMatrix(
      'production',
      ['web', 'api'],
      ['@acme/api'],
      '/apps'
    )

    expect(result).toEqual([
      { app: '@acme/web', environment: 'production', base_sha: '' }
    ])
  })

  it('returns an empty matrix when no requested apps resolve', () => {
    vi.mocked(fs.readdirSync).mockReturnValue(['web'] as never)
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ name: '@acme/web' })
    )

    expect(buildDispatchMatrix('staging', ['unknown'], [], '/apps')).toEqual([])
  })

  it('emits an empty base_sha so downstream matrix jobs skip deploy diffing', () => {
    vi.mocked(fs.readdirSync).mockReturnValue(['web'] as never)
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ name: '@acme/web' })
    )

    const [entry] = buildDispatchMatrix('staging', ['web'], [], '/apps')
    expect(entry.base_sha).toBe('')
  })
})
