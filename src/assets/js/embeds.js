/**
 * Turns links in the compendium into players:
 *   YouTube  -> click-to-load iframe, keeping ?t= timestamps
 *   Video files (/assets/videos/*) -> inline <video>
 *   Discord  -> stays a plain link, with a button to upload a copy we can host
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

  function el(tag, className, props) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    Object.assign(node, props || {});
    return node;
  }

  function youtubeCard(info, title) {
    const card = el("figure", "media");
    const frame = el("div", "media-frame");
    frame.append(
      el("img", "media-thumb", {
        src: `https://i.ytimg.com/vi/${info.id}/hqdefault.jpg`,
        alt: title || "Video thumbnail",
        loading: "lazy",
      })
    );
    const play = el("button", "media-play", { type: "button" });
    play.setAttribute("aria-label", "Play video" + (title ? ": " + title : ""));
    play.append(el("span", "play-icon"));
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
    frame.append(play);
    card.append(frame);
    return card;
  }

  function videoCard(href) {
    const card = el("figure", "media");
    const frame = el("div", "media-frame");
    const video = el("video", null, { controls: true, preload: "metadata", src: href });
    video.setAttribute("playsinline", "");
    frame.append(video);
    card.append(frame);
    return card;
  }

  function uploadButton(discordUrl, block) {
    const button = el("button", "btn tiny upload-btn", { type: "button" });
    button.textContent = "Upload a copy";
    button.title = "Send us the video file so it can be hosted here instead";
    button.addEventListener("click", function () {
      window.dispatchEvent(
        new CustomEvent("suggest:open", {
          detail: { kind: "media", node: block, mediaUrl: discordUrl, wantsFile: true },
        })
      );
    });
    return button;
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
      if (url.origin !== window.location.origin) {
        a.target = "_blank";
        a.rel = "noopener";
      }

      const block = a.closest("p, li") || a;
      const title = (block.textContent || "").trim().replace(/\s+/g, " ").slice(0, 120);
      const yt = youtubeInfo(url);

      if (yt) {
        a.textContent = "youtube.com";
        block.insertAdjacentElement("afterend", youtubeCard(yt, title));
      } else if (VIDEO_EXT.test(url.pathname)) {
        a.textContent = "video";
        block.insertAdjacentElement("afterend", videoCard(a.href));
      } else if (/(^|\.)discord\.com$/.test(url.hostname) && url.pathname.startsWith("/channels/")) {
        a.textContent = "clip in Discord";
        a.classList.add("discord-link");
        if (!block.querySelector(".upload-btn")) {
          a.insertAdjacentText("afterend", " ");
          a.insertAdjacentElement("afterend", uploadButton(a.href, block));
        }
      }
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    const main = document.getElementById("main");
    if (main) enhance(main);
    document.querySelectorAll(".site-header a, .site-footer a").forEach((a) => {
      try {
        if (new URL(a.href).origin !== window.location.origin) {
          a.target = "_blank";
          a.rel = "noopener";
        }
      } catch (_) {}
    });
  });
})();
