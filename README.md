# nx-resolve-affected

GitHub Action that builds an NX deploy matrix for a monorepo, with a separate
base SHA per app.

In a multi-app monorepo, _what changed_ depends on which app you ask. App A
deployed this morning; App B hasn't shipped in a month. A single base SHA is
wrong for at least one of them. This action asks GitHub Deployments for each
app's last successful deploy SHA and runs `nx show projects --affected` against
_that_ SHA per app — so the matrix only contains apps that genuinely need
redeploying.

## How it works

- **On `push`**: environment is inferred from the ref (`main` → `staging`, else
  → `production`). For each app, the action picks a base SHA (see below) and
  includes it in the matrix only if `nx show projects --affected` against that
  base reports it as affected.
- **On `workflow_dispatch`**: the caller passes an explicit `environment` and
  `apps`. Affected resolution is skipped; listed apps go into the matrix with an
  empty `base_sha` (caller deploys `HEAD`).

### Base SHA per app (push only)

The action queries the `<environment>/<short-name>` Deployments environment for
the most recent `SUCCESS` deployment **on the current ref** and uses that commit
as the base. Deployments from other refs (e.g. a feature-branch
`workflow_dispatch`) are ignored, so a push to `main` never bases its diff on a
feature-branch deploy. With no prior deploy on the current ref, it falls back to
the repo's initial commit.

## Usage

```yaml
- name: Resolve affected apps
  id: resolve
  uses: rogiervanstraten/nx-resolve-affected@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    # workflow_dispatch only:
    environment: ${{ inputs.environment }}
    apps: ${{ inputs.apps }}
    # optional:
    exclude: some-app,another-app

- name: Deploy
  if: steps.resolve.outputs.has-apps == 'true'
  strategy:
    matrix:
      include: ${{ fromJson(steps.resolve.outputs.matrix) }}
  run:
    echo "Deploying ${{ matrix.app }} to ${{ matrix.environment }} from ${{
    matrix.base_sha }}"
```

## Inputs

| Input          | Required | Description                                                                      |
| -------------- | -------- | -------------------------------------------------------------------------------- |
| `github-token` | yes      | Token with `deployments:read` and `contents:read` permissions                    |
| `environment`  | no       | Explicit environment for `workflow_dispatch` (e.g. `staging`, `production`)      |
| `apps`         | no       | Comma-separated app short names for `workflow_dispatch`                          |
| `exclude`      | no       | Comma-separated NX project names to omit from the matrix (applies to both flows) |
| `event-name`   | no       | Override for `github.event_name`. Defaults to the runtime context.               |
| `ref-name`     | no       | Override for `github.ref_name`. Defaults to `GITHUB_REF_NAME`.                   |

## Outputs

| Output        | Description                                                |
| ------------- | ---------------------------------------------------------- |
| `matrix`      | JSON array of `{ app, environment, base_sha }` objects     |
| `has-apps`    | `'true'` when the matrix is non-empty, `'false'` otherwise |
| `environment` | Resolved environment name (`staging` \| `production`)      |

### Matrix shape

```json
[
  { "app": "@acme/web", "environment": "staging", "base_sha": "abc123" },
  { "app": "@acme/api", "environment": "staging", "base_sha": "def456" }
]
```

## Requirements

- NX monorepo with apps under `apps/`, each with a `project.json` whose `name`
  is the full NX project name (e.g. `@acme/web`).
- `pnpm` and `nx` on the runner.
- GitHub Deployments environments named `<environment>/<short-app-name>` (e.g.
  `staging/web`).

## Development

```bash
npm install
npm run all    # format, lint, test, bundle
npm test
```

## License

MIT
