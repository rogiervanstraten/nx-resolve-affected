import { describe, it, expect, vi } from 'vitest'
import type * as github from '@actions/github'
import { GithubDeploymentsAdapter } from '../src/adapters/github-deployments.adapter.js'

type Octokit = ReturnType<typeof github.getOctokit>

type Node = {
  commitOid: string
  ref?: { name: string } | null
  latestStatus: { state: string } | null
}

function fakeOctokit(nodes: Node[]): {
  octokit: Octokit
  graphql: ReturnType<typeof vi.fn>
} {
  const normalized = nodes.map((n) => ({ ref: null, ...n }))
  const graphql = vi.fn().mockResolvedValue({
    repository: { deployments: { nodes: normalized } }
  })
  return { octokit: { graphql } as unknown as Octokit, graphql }
}

describe('GithubDeploymentsAdapter.getLastSuccessfulSha', () => {
  it('returns the commit SHA of the most recent SUCCESS deployment', async () => {
    const { octokit } = fakeOctokit([
      { commitOid: 'abc123', latestStatus: { state: 'SUCCESS' } }
    ])
    const adapter = new GithubDeploymentsAdapter(octokit, 'acme', 'monorepo')

    expect(await adapter.getLastSuccessfulSha('staging/web')).toBe('abc123')
  })

  it('skips non-SUCCESS nodes and returns the first successful one', async () => {
    const { octokit } = fakeOctokit([
      { commitOid: 'newest', latestStatus: { state: 'IN_PROGRESS' } },
      { commitOid: 'failed', latestStatus: { state: 'FAILURE' } },
      { commitOid: 'success-sha', latestStatus: { state: 'SUCCESS' } },
      { commitOid: 'older-success', latestStatus: { state: 'SUCCESS' } }
    ])
    const adapter = new GithubDeploymentsAdapter(octokit, 'acme', 'monorepo')

    expect(await adapter.getLastSuccessfulSha('staging/web')).toBe(
      'success-sha'
    )
  })

  it('treats null latestStatus as non-successful', async () => {
    const { octokit } = fakeOctokit([
      { commitOid: 'no-status', latestStatus: null },
      { commitOid: 'abc123', latestStatus: { state: 'SUCCESS' } }
    ])
    const adapter = new GithubDeploymentsAdapter(octokit, 'acme', 'monorepo')

    expect(await adapter.getLastSuccessfulSha('staging/web')).toBe('abc123')
  })

  it('returns null when no deployments exist', async () => {
    const { octokit } = fakeOctokit([])
    const adapter = new GithubDeploymentsAdapter(octokit, 'acme', 'monorepo')

    expect(await adapter.getLastSuccessfulSha('staging/web')).toBeNull()
  })

  it('returns null when no deployment has SUCCESS state', async () => {
    const { octokit } = fakeOctokit([
      { commitOid: 'x', latestStatus: { state: 'FAILURE' } },
      { commitOid: 'y', latestStatus: { state: 'IN_PROGRESS' } }
    ])
    const adapter = new GithubDeploymentsAdapter(octokit, 'acme', 'monorepo')

    expect(await adapter.getLastSuccessfulSha('staging/web')).toBeNull()
  })

  it('passes owner, repo, and env as GraphQL variables', async () => {
    const { octokit, graphql } = fakeOctokit([
      { commitOid: 'abc', latestStatus: { state: 'SUCCESS' } }
    ])
    const adapter = new GithubDeploymentsAdapter(octokit, 'acme', 'monorepo')

    await adapter.getLastSuccessfulSha('staging/web')

    expect(graphql).toHaveBeenCalledWith(expect.any(String), {
      owner: 'acme',
      name: 'monorepo',
      env: 'staging/web'
    })
  })

  it('filters out deployments whose ref does not match when ref is given', async () => {
    const { octokit } = fakeOctokit([
      {
        commitOid: 'feature-sha',
        ref: { name: 'feature/x' },
        latestStatus: { state: 'SUCCESS' }
      },
      {
        commitOid: 'main-sha',
        ref: { name: 'main' },
        latestStatus: { state: 'SUCCESS' }
      }
    ])
    const adapter = new GithubDeploymentsAdapter(octokit, 'acme', 'monorepo')

    expect(await adapter.getLastSuccessfulSha('staging/web', 'main')).toBe(
      'main-sha'
    )
  })

  it('returns null when no deployment matches the ref', async () => {
    const { octokit } = fakeOctokit([
      {
        commitOid: 'feature-sha',
        ref: { name: 'feature/x' },
        latestStatus: { state: 'SUCCESS' }
      }
    ])
    const adapter = new GithubDeploymentsAdapter(octokit, 'acme', 'monorepo')

    expect(await adapter.getLastSuccessfulSha('staging/web', 'main')).toBeNull()
  })

  it('ignores ref filter when ref is undefined', async () => {
    const { octokit } = fakeOctokit([
      {
        commitOid: 'any-sha',
        ref: { name: 'feature/x' },
        latestStatus: { state: 'SUCCESS' }
      }
    ])
    const adapter = new GithubDeploymentsAdapter(octokit, 'acme', 'monorepo')

    expect(await adapter.getLastSuccessfulSha('staging/web')).toBe('any-sha')
  })

  it('treats a null ref on a deployment as non-matching when filtering', async () => {
    const { octokit } = fakeOctokit([
      { commitOid: 'no-ref', ref: null, latestStatus: { state: 'SUCCESS' } },
      {
        commitOid: 'main-sha',
        ref: { name: 'main' },
        latestStatus: { state: 'SUCCESS' }
      }
    ])
    const adapter = new GithubDeploymentsAdapter(octokit, 'acme', 'monorepo')

    expect(await adapter.getLastSuccessfulSha('staging/web', 'main')).toBe(
      'main-sha'
    )
  })
})
