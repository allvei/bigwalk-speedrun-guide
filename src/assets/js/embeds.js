/**
 * Turns plain links in the compendium into players/cards:
 *   - YouTube links  -> click-to-load privacy-friendly iframe (keeps ?t= timestamps)
 *   - Video files    -> self-hosted <video> player (assets/videos/*.mp4|webm|mov)
 *   - Discord links  -> "open in Discord" card, flagged when no local mirror exists yet
 * Markdown stays plain: authors just paste a URL.
 */
(function () {
  const VIDEO_EXT = /\.(mp4|webm|mov|m4v)(\?.*)?$/i;

  function youtubeInfo(url) {
    let id = null;
    if (/(^|\.)youtu\.be$/.test(url.hostname)) {
      id = url.pathname.slice(1).split("/")[0];
    } else if (/(^|\.)youtube(-nocookie)?\.com$/.test(url.hostname)) {
      if (url.pathname === "/watch") id = url.searchParams.get("v");
      else if (url.pathname.startsWith("/embed/")) id = url.pathname.split("/")[2];
      else if (url.pathname.startsWith("/shorts/")) id = url.pathname.split("/")[2];
    }
    if (!id || !/^[\w-]{6,}$/.test(id)) return null;
    const raw = url.searchParams.get("t") || url.searchParams.get("start") || "";
    const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(raw.trim());
    let start = 0;
    if (raw && m) start = (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0));
    return { id, start };
  }

  function el(tag, className, attrs) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    Object.assign(node, attrs || {});
    return node;
  }

  function meta(label, badgeClass, href, hrefLabel) {
    const bar = el("div", "media-meta");
    bar.appendChild(el("span", "badge " + badgeClass, { textContent: label }));
    const link = el("a", null, { href: href, textContent: hrefLabel, rel: "noopener" });
    link.target = "_blank";
    bar.appendChild(link);
    return bar;
  }

  function youtubeCard(info, href, title) {
    const card = el("figure", "media");
    const frame = el("div", "media-frame");
    const thumb = el("img", "media-thumb", {
      src: `https://i.ytimg.com/vi/${info.id}/hqdefault.jpg`,
      alt: title || "Video thumbnail",
      loading: "lazy",
    });
    const play = el("button", "media-play", { type: "button" });
    play.setAttribute("aria-label", "Play video" + (title ? ": " + title : ""));
    play.appendChild(el("span"));
    play.addEventListener("click", function () {
      const iframe = el("iframe", null, {
        src:
          `https://www.youtube-nocookie.com/embed/${info.id}?autoplay=1&rel=0` +
          (info.start ? `&start=${info.start}` : ""),
        allow: "accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture",
        title: title || "YouTube video",
      });
      iframe.allowFullscreen = true;
      frame.replaceChildren(iframe);
    });
    frame.append(thumb, play);
    card.append(frame, meta("YouTube", "youtube", href, "Watch on YouTube"));
    return card;
  }

  function videoCard(href, title) {
    const card = el("figure", "media");
    const frame = el("div", "media-frame");
    const video = el("video", null, { controls: true, preload: "metadata", playsInline: true });
    video.setAttribute("playsinline", "");
    video.src = href;
    frame.appendChild(video);
    card.append(frame, meta("Hosted here", "local", href, "Open file"));
    if (title) card.appendChild(el("figcaption", "sr-only", { textContent: title }));
    return card;
  }

  function discordCard(href, mirrored) {
    const card = el("figure", "media discord-link");
    const body = el("div", "media-body");
    const text = el("p", null, {
      textContent: mirrored
        ? "Original clip posted in the Big Walk Discord."
        : "This clip lives in the Big Walk Discord and cannot be embedded. A mirror can be hosted on this site — suggest one below.",
    });
    const link = el("a", "btn", { href: href, textContent: "Open in Discord", rel: "noopener" });
    link.target = "_blank";
    body.append(text, link);
    const bar = el("div", "media-meta");
    bar.appendChild(el("span", "badge discord", { textContent: "Discord" }));
    card.append(bar, body);
    return card;
  }

  function shortLabel(url) {
    return url.hostname.replace(/^www\./, "") + (url.pathname === "/" ? "" : url.pathname);
  }

  function enhance(root) {
    const anchors = Array.from(root.querySelectorAll("a[href]")).filter(
      (a) => !a.classList.contains("header-anchor") && !a.closest("table") && !a.closest(".media")
    );

    anchors.forEach((a) => {
      let url;
      try {
        url = new URL(a.getAttribute("href"), window.location.href);
      } catch (_) {
        return;
      }
      const block = a.closest("p, li") || a;
      const title = (block.textContent || "").trim().replace(/\s+/g, " ").slice(0, 120);
      let card = null;

      const yt = youtubeInfo(url);
      if (yt) {
        card = youtubeCard(yt, a.href, title);
      } else if (VIDEO_EXT.test(url.pathname)) {
        card = videoCard(a.href, title);
      } else if (/(^|\.)discord\.com$/.test(url.hostname) && url.pathname.startsWith("/channels/")) {
        const mirrored = !!block.querySelector('a[href$=".mp4"], a[href$=".webm"]');
        card = discordCard(a.href, mirrored);
      }
      if (!card) return;

      a.textContent = shortLabel(url);
      a.target = "_blank";
      a.rel = "noopener";
      block.insertAdjacentElement("afterend", card);
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    const main = document.getElementById("main");
    if (main) enhance(main);
  });
})();
