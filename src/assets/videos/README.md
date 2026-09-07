# Self-hosted clips

Drop `.mp4` (H.264 + AAC) or `.webm` files here — anything linked from the compendium
markdown that points at `/assets/videos/<file>` is rendered as an inline player.

This is how Discord clips get preserved: download the attachment, drop it here, and add
a mirror link next to the Discord link in the markdown:

```markdown
**Curtain Clip:** https://discord.com/channels/…/… — [mirror](/assets/videos/curtain-clip.mp4)
```

Keep files small (720p, ~2–5 MB is plenty for a clip). Files over 50 MB should go through
Git LFS instead — `git lfs track "src/assets/videos/*.mp4"` — the deploy workflow already
checks LFS objects out. GitHub blocks single files above 100 MB.
