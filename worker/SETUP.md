# Deploying the Worker

The site itself is static and lives on GitHub Pages. The Worker is one small always-on function
on Cloudflare that does the two things a static page cannot: file suggestions as GitHub issues
(including uploaded clips) and handle GitHub sign-in for replies.

You do all of this once. Everything below runs from the `worker/` folder of a clone of this repo.

## 1. Cloudflare account

Sign up at https://dash.cloudflare.com/sign-up (free plan is enough, no domain needed).

## 2. Install and log in to wrangler

`wrangler` is Cloudflare's CLI. With Node installed:

```bash
npm install -g wrangler
cd worker
wrangler login          # opens the browser, click Allow
```

## 3. A GitHub token for the Worker

This is what lets the Worker create issues on your behalf when an anonymous visitor suggests
something.

1. https://github.com/settings/personal-access-tokens/new (Fine-grained token)
2. Resource owner: your account. Repository access: **Only select repositories** →
   `allvei/bigwalk-speedrun-guide`.
3. Repository permissions: **Contents: Read and write** (for uploaded clips) and
   **Issues: Read and write**.
4. Generate and copy the token.

## 4. First deploy

```bash
wrangler deploy
```

It prints a URL like `https://big-walk-suggestions.<your-subdomain>.workers.dev`. Keep it, it is
referred to below as **WORKER_URL**.

Then store the token from step 3 (it is prompted for, never written to a file):

```bash
wrangler secret put GITHUB_TOKEN --config wrangler.toml
```

The `--config wrangler.toml` is required: without it wrangler picks up the root `wrangler.jsonc`
(the static site worker) and the secret lands on the wrong worker.

## 5. GitHub OAuth app (sign-in and in-page replies)

1. https://github.com/settings/developers → **OAuth Apps** → **New OAuth App**
2. Application name: anything, e.g. `Big Walk compendium`.
3. Homepage URL: `https://allvei.github.io/bigwalk-speedrun-guide/`
4. Authorization callback URL: `WORKER_URL/auth/callback`
5. Register, then **Generate a new client secret**.

Now put the client id in `wrangler.toml` (it is public, safe to commit):

```toml
GITHUB_CLIENT_ID = "Iv1.xxxxxxxxxxxx"
```

and the secret into the Worker (prompted, not committed):

```bash
wrangler secret put GITHUB_CLIENT_SECRET --config wrangler.toml
```

## 6. Point the two sides at each other

In `wrangler.toml`, `ALLOWED_ORIGINS` must be the site's origin, no trailing path:

```toml
ALLOWED_ORIGINS = "https://allvei.github.io"
```

In `src/_data/site.json`, set the Worker URL:

```json
"suggestions": { "endpoint": "WORKER_URL", "maxUploadMB": 25 }
```

Then redeploy the Worker and push the site:

```bash
wrangler deploy
cd .. && git add src/_data/site.json worker/wrangler.toml && git commit -m "Point the site at the worker" && git push
```

## 7. Check it

- Open the site, select some text, right-click → **Suggest**, submit. An issue labelled
  `suggestion` should appear in the repo.
- Reload the page: the quoted text is highlighted (turn highlights on with the speech-bubble
  button in the header if you are not signed in as a maintainer).
- Click **Sign in** in the header, authorise, and reply to a thread from the panel.

## Costs and upkeep

Free plan covers 100k Worker requests a day. Nothing else runs; the site is static.

## If something fails

- `wrangler tail` streams live logs from the Worker.
- A suggestion that returns an error usually means `GITHUB_TOKEN` lacks Issues write, or
  `ALLOWED_ORIGINS` does not match the site origin exactly.
- Sign-in bouncing back signed-out usually means the callback URL in the OAuth app does not
  match `WORKER_URL/auth/callback`.
