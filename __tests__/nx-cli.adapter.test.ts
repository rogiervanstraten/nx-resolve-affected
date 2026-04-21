import { describe, it, expect } from 'vitest'
import { parseInitialCommit } from '../src/adapters/nx-cli.adapter.js'

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
