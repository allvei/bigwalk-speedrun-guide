# Big Walk Strats and Glitches Compendium

Static site (Eleventy) for the Big Walk speedrunning compendium, deployed to GitHub Pages.

- Content lives in `src/content/*.md`, one file per top-level section.
- YouTube links become folded thumbnails that expand and play when clicked.
- Discord clip links become a "Clip on Discord" button with an "Upload" button on hover, so the clip can be re-hosted here.
- An image on its own line becomes a figure, with its alt text as the caption below it.
- Files in `src/assets/videos/` linked as `/assets/videos/<file>` render as inline `<video>` players.
- Readers suggest changes by selecting text, right-clicking and choosing "Suggest". No GitHub account or PR.
- Maintainers edit at `/admin/` (Sveltia CMS), which commits straight to `main`.

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
   - The Cloudflare Worker in `worker/` files each suggestion as an issue in this repo and is the
     only option that also accepts uploaded video files. `cd worker && wrangler deploy`, then
     `wrangler secret put GITHUB_TOKEN` (fine-grained PAT, Contents and Issues read+write on this
     repo only). Set `ALLOWED_ORIGINS` in `wrangler.toml` to the Pages URL.
   - [Formspree](https://formspree.io), [Basin](https://usebasin.com) or
     [Web3Forms](https://web3forms.com) also work for text-only suggestions.

   The site posts JSON with `kind`, `section`, `body`, `media`, `author`, `page`, `source` and,
   for uploads, `upload` (`name`, `type`, `size`, base64 `data`).

   Until an endpoint is set, the form tells people to post in Discord instead and the upload
   field is disabled.
4. Maintainer editor (`/admin/`): GitHub OAuth needs an auth broker because Pages is static.
   Deploy [sveltia-cms-auth](https://github.com/sveltia/sveltia-cms-auth), create a GitHub OAuth
   app pointing at it, then set `base_url` in `src/admin/config.yml` to the worker URL. Only users
   with write access can save. Without it, maintainers can still edit the markdown on GitHub.
5. Custom domain (optional): add `src/CNAME` containing the domain.
