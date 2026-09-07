# Big Walk Strats and Glitches Compendium

Static site (Eleventy) for the Big Walk speedrunning compendium, deployed to GitHub Pages.

- **Content** lives in `src/content/*.md` — plain markdown, one file per top-level section.
- **YouTube links** in that markdown become click-to-load players automatically.
- **Discord links** become "open in Discord" cards, flagged when no mirror exists yet.
- **Self-hosted clips** go in `src/assets/videos/` and are linked as `/assets/videos/<file>` — they
  render as an inline `<video>` player. See `src/assets/videos/README.md`.
- **Anyone** can suggest an edit from the site itself: every heading has a *suggest an edit*
  button that pre-fills that section's markdown in a form. No GitHub account, no fork, no PR.
- **Maintainers** edit at `/admin/` (Sveltia CMS), which commits straight to `main`.

## Local development

```bash
npm install
npm start          # http://localhost:8080
npm run build      # output in _site/
```

## Setup checklist

1. **Enable Pages**: repo Settings → Pages → Source: **GitHub Actions**. Pushing to `main`
   then builds and deploys via `.github/workflows/deploy.yml`.
2. **Point the site at this repo**: set `repo` and `branch` in `src/_data/site.json`
   (also `discordUrl` and `speedrunUrl`, which are placeholders right now).
3. **Suggestion inbox** — pick one and put its URL in `suggestions.endpoint` in
   `src/_data/site.json`:
   - [Formspree](https://formspree.io) — free tier, 50 submissions/month, emails you each one.
     Create a form, use the `https://formspree.io/f/xxxx` endpoint. It accepts the JSON the
     site posts.
   - [Basin](https://usebasin.com) or [Web3Forms](https://web3forms.com) — same idea.
   - The Cloudflare Worker in `worker/` — fully anonymous *and* every suggestion lands in this
     repo as a labelled issue. `cd worker && wrangler deploy`, then
     `wrangler secret put GITHUB_TOKEN` (fine-grained PAT, Issues read+write on this repo only).

   The site posts JSON with `kind`, `section`, `body`, `media`, `author`, `page`, `source`.

   Until an endpoint is set, the form falls back to copy-to-clipboard plus a pre-filled
   GitHub issue link.
4. **Maintainer editor** (`/admin/`): GitHub OAuth needs a tiny auth broker because Pages is
   static. Deploy [sveltia-cms-auth](https://github.com/sveltia/sveltia-cms-auth) (one click,
   free Cloudflare Worker), create a GitHub OAuth app pointing at it, then set `base_url` in
   `src/admin/config.yml` to the worker URL. Only users with write access to the repo can save.
   Without it, maintainers can still edit the markdown files directly on GitHub.
5. **Custom domain** (optional): add `src/CNAME` containing the domain.
