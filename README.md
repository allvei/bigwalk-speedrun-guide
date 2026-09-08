# Big Walk speedrun guide

Static site (Eleventy) for the Big Walk speedrunning compendium, deployed to GitHub Pages.

- Content lives in `src/content/*.md`, one file per top-level section.
- YouTube links become folded thumbnails that expand and play when clicked.
- Discord clip links become a "Clip on Discord" button with an "Upload" button on hover, so the clip can be re-hosted here.
- An image on its own line becomes a figure, with its alt text as the caption below it.
- Files in `src/assets/videos/` linked as `/assets/videos/<file>` render as inline `<video>` players.
- Readers suggest changes by selecting text, right-clicking and choosing "Suggest". Each suggestion becomes a GitHub issue.
- Open issues labelled `suggestion` are read back on load: the quoted text is highlighted in the page and clicking it opens the thread, with its comments, in a side panel.
- Highlights are on by default for maintainers (repo write access), off for everyone else, and the header toggle overrides that per browser.
- Signing in with GitHub (OAuth, through the Worker) lets people reply from the panel; without it the panel links to the issue.
- Maintainers edit the markdown on GitHub with repository write access (github.com or github.dev).

## Local development

```bash
npm install
npm start          # http://localhost:8080
npm run build      # output in _site/
```

## Setup checklist

1. Enable Pages: Settings > Pages > Source: GitHub Actions. Pushes to `main` deploy via
   `.github/workflows/deploy.yml`.
2. Check `src/_data/site.json`: `repo`, `branch`, `discordUrl`, `speedrunUrl`.
3. Suggestion inbox: put an endpoint URL in `suggestions.endpoint` in `src/_data/site.json`.
   - The Cloudflare Worker in `worker/` (step-by-step guide: `worker/SETUP.md`) files each suggestion as an issue in this repo and is the
     only option that also accepts uploaded video files. `cd worker && wrangler deploy`, then
     `wrangler secret put GITHUB_TOKEN` (fine-grained PAT, Contents and Issues read+write on this
     repo only). Set `ALLOWED_ORIGINS` in `wrangler.toml` to the Pages URL.
   - [Formspree](https://formspree.io), [Basin](https://usebasin.com) or
     [Web3Forms](https://web3forms.com) also work for text-only suggestions.

   The site posts JSON with `kind`, `section`, `quote`, `body`, `media`, `author`, `page`, `source`
   and, for uploads, `upload` (`name`, `type`, `size`, base64 `data`).

   The issue body starts with `<!-- anchor: {"quote":…,"section":…} -->`. That is what the site
   matches against the page text to place a highlight, so keep it when editing an issue.

   Until an endpoint is set, the form tells people to post in Discord instead and the upload
   field is disabled.
4. Sign-in and in-page replies: create a GitHub OAuth app (Settings > Developer settings > OAuth
   Apps) with homepage = the Pages URL and callback = `<worker URL>/auth/callback`. Put the client
   id in `GITHUB_CLIENT_ID` in `worker/wrangler.toml` and the secret in
   `wrangler secret put GITHUB_CLIENT_SECRET`. The Worker keeps the user token in an HttpOnly
   cookie and posts comments as that user; the site never sees a token.
5. Maintainers: give them write access to this repo (Settings > Collaborators). They edit
   `src/content/*.md` on GitHub; a push to `main` redeploys.
6. Custom domain (optional): add `src/CNAME` containing the domain.
