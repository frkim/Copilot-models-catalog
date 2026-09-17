# Copilot-models-catalog

Small command-line application that lists every GitHub Copilot model available
to the authenticated user, together with its current status (`enabled` or
`disabled`), and outputs the result as JSON.

## How the status is determined

The CLI calls `GET https://api.githubcopilot.com/models`. Models returned by
that endpoint carry an optional `policy` object:

* no `policy` &rarr; the model is always available, so it is reported as `enabled`;
* `policy.state === "enabled"` &rarr; the policy has been accepted, the model is `enabled`;
* any other `policy.state` (for example `unconfigured`) &rarr; the model is `disabled`
  until the user or an organization administrator enables it.

## Requirements

* Node.js 18.17 or later (no runtime dependencies).
* A GitHub token belonging to an account with a Copilot subscription. The token
  is exchanged for a short-lived Copilot token before listing the models. A
  Copilot token (a string starting with `tid=`) can be passed directly.

## Usage

```bash
export GITHUB_TOKEN=<your token>

# Print the whole catalog as JSON
node src/cli.js

# Only the models that are currently disabled, written to a file
node src/cli.js --status disabled --output disabled-models.json
```

### Options

| Option | Description |
| --- | --- |
| `-t, --token <token>` | GitHub or Copilot token. Defaults to `$COPILOT_TOKEN`, `$GITHUB_TOKEN` or `$GH_TOKEN`. |
| `-o, --output <file>` | Write the JSON catalog to `<file>` instead of stdout. |
| `-s, --status <status>` | Keep only models with this status: `all` (default), `enabled` or `disabled`. |
| `-c, --compact` | Print the JSON on a single line. |
| `-h, --help` | Show the help message. |
| `-v, --version` | Show the version number. |

Exit codes: `0` on success, `1` when the API call fails, `2` for invalid
arguments or a missing token.

### Output

```json
{
  "generatedAt": "2026-01-01T00:00:00.000Z",
  "source": "https://api.githubcopilot.com/models",
  "summary": { "total": 2, "enabled": 1, "disabled": 1 },
  "models": [
    {
      "id": "claude-sonnet-4",
      "name": "Claude Sonnet 4",
      "vendor": "Anthropic",
      "family": "claude-sonnet-4",
      "version": null,
      "status": "disabled",
      "enabled": false,
      "policy": { "state": "unconfigured", "required": true, "termsUrl": null },
      "preview": true,
      "modelPicker": { "enabled": false, "category": null },
      "capabilities": { "type": "chat", "supports": {}, "limits": {} }
    }
  ]
}
```

The `models` array above is truncated to a single entry for readability, which
is why it does not match the `total` of the summary. The document also carries a
`filter` field with the value of `--status`: the `summary` always describes the
full catalog, even when the filter removed models from the `models` array.

## Tests

```bash
npm test
```
