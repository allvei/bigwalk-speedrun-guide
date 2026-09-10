/**
 * Turns links in the compendium into players:
 *   YouTube  -> folded thumbnail that opens into an autoplaying iframe, keeping ?t= timestamps
 *   Video files (/assets/videos/*) -> folded thumbnail that opens into a <video>
 *   Discord  -> a button linking to the message, with an upload button on hover
 */
(function () {
  const VIDEO_EXT = /\.(mp4|webm|mov|m4v)(\?.*)?$/i;
  const PLACEHOLDER = "data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs=";

  function youtubeInfo(url) {
    let id = null;
    if (/(^|\.)youtu\.be$/.test(url.hostname)) {
      id = url.pathname.slice(1).split("/")[0];
    } else if (/(^|\.)youtube(-nocookie)?\.com$/.test(url.hostname)) {
      if (url.pathname === "/watch") id = url.searchParams.get("v");
      else if (url.pathname.startsWith("/embed/")) id = url.pathname.split("/")[2];
      else if (url.pathname.startsWith("/shorts/")) id = url.pathname.split("/")[2];
    }
    if (!id || !/[\w-]{6,}$/.test(id)) return null;
    const raw = url.searchParams.get("t") || url.searchParams.get("start") || "";
    const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(raw.trim());
    let start = 0;
    if (raw && m) start = +(m[1] || 0) * 3600 + +(m[2] || 0) * 60 + +(m[3] || 0);
    return { id, start };
  }

  function el(tag, className, props) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    Object.assign(node, props || {});
    return node;
  }

  /* A folded player: thumbnail plus title and credit, expanding into the real player on open. */
  function mediaBox(title, credit, thumbSrc, buildPlayer) {
    const box = el("details", "media");
    const summary = el("summary", "media-summary");
    if (thumbSrc) {
      summary.append(el("img", "media-thumb", { src: thumbSrc, alt: "", loading: "lazy" }));
    }
    summary.append(el("span", "media-title", { textContent: title }));
    if (credit) {
      summary.append(el("span", "media-credit", { textContent: "by " + credit }));
    }
    box.append(summary);

    const frame = el("div", "media-frame");
    box.append(frame);
    box.addEventListener("toggle", function () {
      if (box.open) {
        if (!frame.firstChild) frame.append(buildPlayer());
      } else {
        frame.replaceChildren();
      }
    });
    return box;
  }

  function youtubeCard(info, title, credit) {
    return mediaBox(title, credit, `https://i.ytimg.com/vi/${info.id}/mqdefault.jpg`, function () {
      const iframe = el("iframe", null, {
        src:
          `https://www.youtube-nocookie.com/embed/${info.id}?autoplay=1&rel=0` +
          (info.start ? `&start=${info.start}` : ""),
        allow: "accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture",
        title: title,
      });
      iframe.allowFullscreen = true;
      return iframe;
    });
  }

  function videoCard(href, title, credit) {
    const box = mediaBox(title, credit, PLACEHOLDER, function () {
      const video = el("video", null, {
        controls: true,
        autoplay: true,
        preload: "metadata",
        src: href,
        title: title,
      });
      video.setAttribute("playsinline", "");
      return video;
    });

    const thumb = box.querySelector(".media-thumb");
    if (thumb) {
      const v = document.createElement("video");
      v.src = href;
      v.preload = "metadata";
      v.muted = true;
      v.playsInline = true;

      const canvas = document.createElement("canvas");
      canvas.width = 96;
      canvas.height = 54;
      const ctx = canvas.getContext("2d");

      v.addEventListener("loadeddata", function () {
        if (v.readyState >= 2) v.currentTime = 0.1;
      });
      v.addEventListener("seeked", function () {
        try {
          ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
          thumb.src = canvas.toDataURL("image/jpeg", 0.85);
        } catch (_) {}
      });
      v.addEventListener("error", function () {
        /* Keep the placeholder thumbnail if the clip cannot be decoded. */
      });
      v.load();
    }

    return box;
  }

  function uploadButton(discordUrl, block) {
    const button = el("button", "btn tiny upload-btn", { type: "button" });
    button.textContent = "Upload";
    button.title = "Replace this link with a file we can embed to the page";
    button.addEventListener("click", function () {
      window.dispatchEvent(
        new CustomEvent("suggest:open", {
          detail: { kind: "media", node: block, mediaUrl: discordUrl, wantsFile: true },
        })
      );
    });
    return button;
  }

  function place(block, card) {
    if (block.tagName === "LI") {
      block.replaceChildren(card);
    } else {
      block.replaceWith(card);
    }
  }

  function parseTitle(block, linkText) {
    const raw = (block.textContent || "")
      .replace(linkText, "")
      .replace(/\s+/g, " ")
      .replace(/[:\-\s]+$/, "")
      .trim()
      .slice(0, 160);
    const parts = raw.split(/ by /i, 2);
    return {
      title: parts[0].trim() || "Video",
      credit: (parts[1] || "").trim(),
    };
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
      const { title, credit } = parseTitle(block, a.textContent || "");
      const yt = youtubeInfo(url);

      if (yt) {
        a.remove();
        place(block, youtubeCard(yt, title, credit));
      } else if (VIDEO_EXT.test(url.pathname)) {
        a.remove();
        place(block, videoCard(url.href, title, credit));
      } else if (/(^|\.)discord\.com$/.test(url.hostname) && url.pathname.startsWith("/channels/")) {
        const group = el("span", "clip-group");
        a.replaceWith(group);
        a.textContent = "Clip on Discord";
        a.className = "btn tiny discord-btn";
        group.append(a, uploadButton(a.href, block));
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
