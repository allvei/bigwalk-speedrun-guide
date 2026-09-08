/* An image the site references but does not have is shown as a labelled gap rather than the
   browser's broken icon, and anyone with push rights can fill it in from the page. */
(function () {
  const cfg = window.SITE_CONFIG || {};
  const AUTH = (cfg.endpoint || "").replace(/\/+$/, "") + "/auth";
  const TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

  /* /prefix/assets/images/foo.png is src/assets/images/foo.png in the repository. */
  function repoPath(src) {
    const match = /\/assets\/images\/(.+)$/.exec(new URL(src, location.href).pathname);
    return match ? "src/assets/images/" + decodeURIComponent(match[1]) : "";
  }

  function icon() {
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M10.5 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6.5"/>' +
      '<circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>' +
      '<path d="m2 2 20 20"/></svg>'
    );
  }

  function toBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("read failed"));
      reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
      reader.readAsDataURL(file);
    });
  }

  function placeholder(img) {
    const path = repoPath(img.getAttribute("src") || "");
    const box = document.createElement("div");
    box.className = "missing-image";
    box.innerHTML =
      icon() +
      '<div class="missing-image-text"><strong>Image missing</strong><code></code></div>';
    box.querySelector("code").textContent = path || img.getAttribute("src") || "";
    img.replaceWith(box);

    if (!path || !cfg.endpoint) return;

    /* The button only appears once the session says this visitor can push. */
    function offerUpload(session) {
      if (!session || !session.canWrite || box.querySelector(".btn")) return;

      const input = document.createElement("input");
      input.type = "file";
      input.accept = TYPES.join(",");
      input.hidden = true;

      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn";
      button.textContent = "Upload image";
      button.addEventListener("click", () => input.click());

      const note = document.createElement("p");
      note.className = "missing-image-note";

      input.addEventListener("change", async function () {
        const file = input.files && input.files[0];
        if (!file) return;
        if (!TYPES.includes(file.type)) {
          note.textContent = "Only png, jpg, gif and webp images.";
          return;
        }
        button.disabled = true;
        note.textContent = "Uploading…";
        try {
          const response = await fetch(AUTH + "/image", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path, type: file.type, data: await toBase64(file) }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "upload failed");
          note.textContent = "Committed to the repository. The page shows it once the site rebuilds.";
          button.remove();
        } catch (error) {
          note.textContent = error.message;
          button.disabled = false;
        }
      });

      box.append(button, note, input);
    }

    offerUpload(window.siteSession);
    document.addEventListener("site-session", (event) => offerUpload(event.detail));
  }

  function check(img) {
    /* Only the site's own images; a thumbnail failing to load is YouTube's problem. */
    if (!repoPath(img.getAttribute("src") || "")) return;
    if (img.complete) {
      if (!img.naturalWidth) placeholder(img);
      return;
    }
    img.addEventListener("error", () => placeholder(img), { once: true });
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("main img").forEach(check);
  });
})();
