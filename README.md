# GitHub Wrapped

Spotify Wrapped for GitHub: a tap-through story of a person's or an organization's year in code.

- **People:** contributions, comparison with last year, biggest day and heatmap, longest streak, languages, top repos, most-starred repo, PRs/reviews/issues, peak month, commit vocabulary, and a coding persona based on commit hours.
- **Organizations:** total commits, merged PRs (with comparison), issues, top repos, top contributors, languages, peak month, team vocabulary and team persona.
- **Sharing:** save a share card or a 1080×1920 Stories image, or copy a link (`?user=octocat&year=2026`, `?org=vercel&year=2026`).

## How it works

| Mode | Data path | Sees |
| --- | --- | --- |
| Public (default) | Browser → Worker `/api/*` → GitHub, cached in KV | Public data only |
| Token ("Include private work") | Browser → `api.github.com` directly | Whatever the visitor's token can see |

The Worker's `GITHUB_TOKEN` must be a classic token with **no scopes, or only `read:org`**; the Worker refuses to serve with anything else. Without `repo` access it only reads public data, and private repos are also stripped from every public response. Visitor tokens never reach the Worker.

```
public/        static app (served by the Worker)
  github.js    GraphQL queries, shared by the browser and the Worker
  stats.js     raw data → numbers
  slides.js    numbers → slide markup
  app.js       setup form, story player, image export
worker/        Cloudflare Worker: /api/user, /api/org + static assets
```

## Develop

```sh
npm install
echo "GITHUB_TOKEN=<token with no scopes or only read:org>" > .dev.vars
npm run dev            # http://localhost:8787
```

## Deploy (Cloudflare)

```sh
npx wrangler kv namespace create CACHE      # paste the binding into wrangler.jsonc as kv_namespaces
npx wrangler secret put GITHUB_TOKEN        # a classic token with no scopes (or only read:org)
npm run deploy
```

## Notes and limits

- Org stats count commits on each repo's default branch, across the 100 most recently pushed repos.
- Top contributors, the coding clock and vocabulary come from a sample: the latest 300 commits in each of the 8 busiest repos for an org, or the latest 100 commits in each of a person's top 6 repos.
- GitHub reports private work only as a count, so it is included in the totals but not in language or repo stats.
- Commit hours use the viewer's local time zone.
