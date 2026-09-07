/**
 * Suggestions: select text, right-click, pick "Suggest". The selected text is
 * pre-filled so anyone can rewrite it. Video files can be attached so Discord
 * clips can be re-hosted here.
 *
 * Submissions POST as JSON to SITE_CONFIG.endpoint (see worker/ in the repo).
 */
(function () {
  const cfg = window.SITE_CONFIG || {};
  const maxUploadBytes = (cfg.maxUploadMB || 25) * 1024 * 1024;

  const KINDS = [
    ["edit", "Edit to existing text"],
    ["addition", "New glitch, strat or tech"],
    ["media", "Video"],
    ["correction", "Correction (credit, name, link)"],
    ["other", "Other"],
  ];

  function headingFor(node) {
    if (!node) return null;
    let el = node instanceof Element ? node : node.parentElement;
    while (el && el !== document.body) {
      let sibling = el.previousElementSibling;
      while (sibling) {
        if (/^H[2-4]$/.test(sibling.tagName)) return sibling;
        const nested = sibling.querySelector && sibling.querySelector("h2, h3, h4");
        if (nested) return nested;
        sibling = sibling.previousElementSibling;
      }
      el = el.parentElement;
    }
    return document.querySelector("#main h2");
  }

  function headingText(h) {
    return h ? h.textContent.replace(/\s*#\s*$/, "").trim() : "Whole page";
  }

  function sourceFor(node) {
    const el = node instanceof Element ? node : node && node.parentElement;
    const section = el && el.closest(".doc-section");
    return section ? section.dataset.source : "";
  }

  /* ---------- modal ---------- */

  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.hidden = true;
  backdrop.innerHTML = `
    <form class="modal">
      <h2>Suggest a change</h2>
      <p class="section-line">Section: <strong data-section-label></strong></p>

      <label for="sg-kind">Type <abbr title="required">*</abbr></label>
      <select id="sg-kind" name="kind">
        ${KINDS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}
      </select>

      <label for="sg-body">Suggestion <abbr title="required">*</abbr></label>
      <textarea id="sg-body" name="body" required></textarea>

      <label for="sg-media">Video link</label>
      <input id="sg-media" name="media" type="url" placeholder="https://">

      <label for="sg-file">Video file <span class="hint" data-upload-hint></span></label>
      <input id="sg-file" name="file" type="file" accept="video/*">

      <label for="sg-author">Name or handle for credit</label>
      <input id="sg-author" name="author" placeholder="Anonymous">

      <input type="text" name="_gotcha" tabindex="-1" autocomplete="off" style="display:none" aria-hidden="true">
      <input type="hidden" name="page">
      <input type="hidden" name="source">
      <input type="hidden" name="section">

      <div class="modal-actions">
        <button type="button" class="btn" data-suggest-close>Cancel</button>
        <button type="submit" class="btn primary">Send</button>
      </div>
      <p class="status" role="status"></p>
    </form>`;
  document.body.appendChild(backdrop);

  const form = backdrop.querySelector("form");
  const status = backdrop.querySelector(".status");
  const sectionLabel = backdrop.querySelector("[data-section-label]");
  const uploadHint = backdrop.querySelector("[data-upload-hint]");
  const fields = {
    kind: form.querySelector("#sg-kind"),
    body: form.querySelector("#sg-body"),
    media: form.querySelector("#sg-media"),
    file: form.querySelector("#sg-file"),
    author: form.querySelector("#sg-author"),
    page: form.querySelector('input[name="page"]'),
    source: form.querySelector('input[name="source"]'),
    section: form.querySelector('input[name="section"]'),
  };
  uploadHint.textContent = cfg.endpoint ? `(up to ${cfg.maxUploadMB} MB)` : "(uploads not enabled yet)";
  fields.file.disabled = !cfg.endpoint;

  let lastFocused = null;

  function close() {
    backdrop.hidden = true;
    document.body.style.overflow = "";
    if (lastFocused) lastFocused.focus();
  }

  function open(opts) {
    const heading = opts.heading || headingFor(opts.node);
    lastFocused = document.activeElement;
    status.textContent = "";
    status.className = "status";
    form.reset();
    fields.kind.value = KINDS.some(([v]) => v === opts.kind) ? opts.kind : "addition";
    fields.section.value = headingText(heading);
    sectionLabel.textContent = fields.section.value;
    fields.page.value = heading && heading.id ? location.origin + location.pathname + "#" + heading.id : location.href;
    fields.source.value = opts.source || sourceFor(opts.node) || "";
    fields.body.value = opts.body || "";
    fields.media.value = opts.mediaUrl || "";
    fields.body.placeholder =
      opts.kind === "media"
        ? "Anything worth knowing about the clip: who recorded it, what it shows."
        : "What should it say instead?";
    backdrop.hidden = false;
    document.body.style.overflow = "hidden";
    (opts.wantsFile && !fields.file.disabled ? fields.file : fields.body).focus();
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read that file"));
      reader.onload = () =>
        resolve({
          name: file.name,
          type: file.type,
          size: file.size,
          data: String(reader.result).split(",")[1],
        });
      reader.readAsDataURL(file);
    });
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (!fields.body.value.trim()) return;

    const payload = {
      kind: fields.kind.value,
      section: fields.section.value,
      body: fields.body.value,
      media: fields.media.value,
      author: fields.author.value,
      page: fields.page.value,
      source: fields.source.value,
      _gotcha: form.querySelector('input[name="_gotcha"]').value,
      submittedAt: new Date().toISOString(),
    };

    if (!cfg.endpoint) {
      status.className = "status error";
      status.innerHTML =
        'Sending is not set up yet. Post it in <a href="' + cfg.discordUrl + '" target="_blank" rel="noopener">Discord</a> for now.';
      return;
    }

    const file = fields.file.files && fields.file.files[0];
    if (file) {
      if (file.size > maxUploadBytes) {
        status.className = "status error";
        status.textContent = `That file is ${(file.size / 1048576).toFixed(1)} MB, the limit is ${cfg.maxUploadMB} MB.`;
        return;
      }
      status.className = "status";
      status.textContent = "Uploading…";
      try {
        payload.upload = await readFile(file);
      } catch (error) {
        status.className = "status error";
        status.textContent = error.message;
        return;
      }
    }

    status.className = "status";
    status.textContent = "Sending…";
    try {
      const response = await fetch(cfg.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      status.className = "status ok";
      status.textContent = "Sent. Thanks.";
      setTimeout(close, 1500);
    } catch (error) {
      status.className = "status error";
      status.innerHTML =
        "That did not go through (" + error.message + '). Try again, or post it in <a href="' +
        cfg.discordUrl + '" target="_blank" rel="noopener">Discord</a>.';
    }
  });

  form.querySelector("[data-suggest-close]").addEventListener("click", close);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !backdrop.hidden) close();
  });
  window.addEventListener("suggest:open", (e) => open(e.detail || {}));

  /* ---------- right-click menu on a selection ---------- */

  const menu = document.createElement("div");
  menu.className = "context-menu";
  menu.hidden = true;
  menu.innerHTML = '<button type="button">Suggest</button>';
  document.body.appendChild(menu);

  function hideMenu() {
    menu.hidden = true;
  }

  document.addEventListener("contextmenu", function (event) {
    const main = document.getElementById("main");
    const selection = window.getSelection();
    const text = selection ? selection.toString().trim() : "";
    if (!main || !text || !main.contains(event.target)) return hideMenu();

    event.preventDefault();
    const node = selection.anchorNode;
    menu.hidden = false;
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    menu.style.left = Math.min(event.clientX, window.innerWidth - width - 8) + window.scrollX + "px";
    menu.style.top = Math.min(event.clientY, window.innerHeight - height - 8) + window.scrollY + "px";
    menu.firstChild.onclick = function () {
      hideMenu();
      open({ kind: "edit", node: node, body: text });
    };
  });

  document.addEventListener("click", hideMenu);
  document.addEventListener("scroll", hideMenu, { passive: true });
  document.addEventListener("keydown", (e) => e.key === "Escape" && hideMenu());

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("[data-suggest-open]").forEach((button) => {
      button.addEventListener("click", () =>
        open({ kind: button.dataset.kind || "addition", heading: null, node: null })
      );
    });
  });
})();
