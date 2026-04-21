# nx-resolve-affected

GitHub Action that builds an NX deploy matrix for an apps monorepo.

- **On `push`**: for each app, queries the GitHub Deployments API to find the
  last successful deployment SHA for that app's environment, then runs
  `nx show projects --affected` against that SHA to decide whether the app needs
  redeploying. Each app gets its **own** base SHA.
- **On `workflow_dispatch`**: skips affected resolution and returns the explicit
  list of apps passed in, tagged with the caller-supplied environment.

## Usage

```yaml
- name: Resolve affected apps
  id: resolve
  uses: rogiervanstraten/nx-resolve-affected@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    event-name: ${{ github.event_name }}
    ref-name: ${{ github.ref_name }}
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

| Input          | Required | Description                                                                          |
| -------------- | -------- | ------------------------------------------------------------------------------------ |
| `github-token` | yes      | Token with `deployments:read` and `contents:read` permissions                        |
| `event-name`   | yes      | `github.event_name` — drives the push vs workflow_dispatch branch                    |
| `ref-name`     | yes      | `github.ref_name` — on push, `main` maps to `staging`, anything else to `production` |
| `environment`  | no       | Explicit environment for `workflow_dispatch` (e.g. `staging`, `production`)          |
| `apps`         | no       | Comma-separated app short names for `workflow_dispatch`                              |
| `exclude`      | no       | Comma-separated NX project names to exclude from affected resolution                 |

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

On `workflow_dispatch`, `base_sha` is an empty string — callers are expected to
deploy the current `HEAD` unconditionally in that flow.

## How the base SHA is chosen (per app)

For each app the action looks up the most recent deployment in the
`<environment>/<short-name>` GitHub Deployments environment and uses the SHA of
the last one whose `latestStatus.state == SUCCESS`. If no successful deployment
exists, it falls back to the repo's initial commit so the app is always
considered affected on its first deploy.

An app is included in the matrix only if `nx show projects --affected` against
that base SHA reports it as affected.

## Requirements

- NX monorepo with app projects under `apps/` and a `project.json` per app whose
  `name` is the full NX project name (e.g. `@acme/web`).
- `pnpm` and `nx` available on the runner.
- Deployment environments named `<environment>/<short-app-name>` (e.g.
  `staging/web`) — this is how the action correlates apps to their deployment
  history.

## Development

```bash
npm install
npm run all    # format, lint, test, bundle
npm test
```

## License

MIT
