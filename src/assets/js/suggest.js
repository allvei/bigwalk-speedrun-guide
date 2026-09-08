/**
 * Suggestions: select text, right-click, pick "Suggest". The selection is turned back into
 * markdown before it is pre-filled, so bold, links and code survive the round trip and the
 * issue can show a real diff. Video files can be attached so Discord clips are re-hosted here.
 *
 * Submissions POST as JSON to SITE_CONFIG.endpoint (see worker/ in the repo).
 */
(function () {
  const cfg = window.SITE_CONFIG || {};
  const maxUploadBytes = (cfg.maxUploadMB || 25) * 1024 * 1024;

  /* Lucide icons, inlined so the page pulls in no icon library. */
  const ICONS = {
    bold: '<path d="M14 12a4 4 0 0 0 0-8H6v8"/><path d="M15 20a4 4 0 0 0 0-8H6v8Z"/>',
    italic: '<line x1="19" x2="10" y1="4" y2="4"/><line x1="14" x2="5" y1="20" y2="20"/><line x1="15" x2="9" y1="4" y2="20"/>',
    code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    list: '<line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/>',
  };

  function icon(name) {
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      ICONS[name] +
      "</svg>"
    );
  }

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

  /* Every content file the selection touches, so a selection spanning sections says so. */
  function sourcesFor(range) {
    if (!range) return [];
    return Array.from(document.querySelectorAll(".doc-section"))
      .filter((section) => {
        try {
          return range.intersectsNode(section);
        } catch (_) {
          return false;
        }
      })
      .map((section) => section.dataset.source)
      .filter(Boolean);
  }

  /* The selected DOM turned back into markdown, so the editable text keeps its formatting. */
  function toMarkdown(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue;
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    if (node.classList.contains("media") || node.classList.contains("clip-group")) return "";
    const inner = Array.from(node.childNodes).map(toMarkdown).join("");
    switch (node.tagName) {
      case "STRONG":
      case "B":
        return inner.trim() ? "**" + inner.trim() + "**" : inner;
      case "EM":
      case "I":
        return inner.trim() ? "*" + inner.trim() + "*" : inner;
      case "CODE":
        return "`" + inner + "`";
      case "DEL":
      case "S":
        return "~~" + inner + "~~";
      case "A":
        return node.classList.contains("header-anchor")
          ? inner
          : "[" + inner + "](" + node.getAttribute("href") + ")";
      case "LI":
        return "- " + inner.trim() + "\n";
      case "BR":
        return "\n";
      case "H2":
      case "H3":
      case "H4":
        return "#".repeat(Number(node.tagName[1])) + " " + inner.trim() + "\n\n";
      case "P":
      case "DIV":
      case "BLOCKQUOTE":
      case "UL":
      case "OL":
      case "FIGURE":
        return inner.trim() + "\n\n";
      default:
        return inner;
    }
  }

  /* The quote is shown as it appears on the page, so bold and links read the same in the box. */
  function selectionHtml(range) {
    const holder = document.createElement("div");
    holder.appendChild(range.cloneContents());
    holder.querySelectorAll(".media, .clip-group, script, style").forEach((el) => el.remove());
    /* Links keep their look but not their behaviour: this is a preview, not navigation. */
    holder.querySelectorAll("a").forEach((link) => {
      const span = document.createElement("span");
      span.className = "quote-link";
      span.innerHTML = link.innerHTML;
      link.replaceWith(span);
    });
    return holder.innerHTML;
  }

  function selectionMarkdown(range) {
    const holder = document.createElement("div");
    holder.appendChild(range.cloneContents());
    return toMarkdown(holder).replace(/\n{3,}/g, "\n\n").trim();
  }

  /* ---------- modal ---------- */

  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.hidden = true;
  backdrop.innerHTML = `
    <form class="modal">
      <h2>Suggest a change</h2>
      <p class="section-line">Section: <strong data-section-label></strong></p>
      <blockquote class="quote-line" data-quote-label hidden></blockquote>

      <label for="sg-title">Title <abbr title="required">*</abbr></label>
      <input id="sg-title" name="title" required placeholder="Fix capitalisation">

      <label for="sg-kind">Type <abbr title="required">*</abbr></label>
      <select id="sg-kind" name="kind">
        ${KINDS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}
      </select>

      <label for="sg-body">Suggestion <abbr title="required">*</abbr></label>
      <div class="md-toolbar" role="toolbar" aria-label="Formatting">
        <button type="button" class="icon-btn" data-md="bold" title="Bold" aria-label="Bold">${icon("bold")}</button>
        <button type="button" class="icon-btn" data-md="italic" title="Italic" aria-label="Italic">${icon("italic")}</button>
        <button type="button" class="icon-btn" data-md="code" title="Code" aria-label="Code">${icon("code")}</button>
        <button type="button" class="icon-btn" data-md="link" title="Link" aria-label="Link">${icon("link")}</button>
        <button type="button" class="icon-btn" data-md="list" title="Bulleted list" aria-label="Bulleted list">${icon("list")}</button>
      </div>
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
      <input type="hidden" name="quote">

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
  const quoteLabel = backdrop.querySelector("[data-quote-label]");
  const uploadHint = backdrop.querySelector("[data-upload-hint]");
  const editOption = form.querySelector('#sg-kind option[value="edit"]');
  const fields = {
    title: form.querySelector("#sg-title"),
    kind: form.querySelector("#sg-kind"),
    body: form.querySelector("#sg-body"),
    media: form.querySelector("#sg-media"),
    file: form.querySelector("#sg-file"),
    author: form.querySelector("#sg-author"),
    page: form.querySelector('input[name="page"]'),
    source: form.querySelector('input[name="source"]'),
    section: form.querySelector('input[name="section"]'),
    quote: form.querySelector('input[name="quote"]'),
  };
  uploadHint.textContent = cfg.endpoint ? `(up to ${cfg.maxUploadMB} MB)` : "(uploads not enabled yet)";
  fields.file.disabled = !cfg.endpoint;

  let lastFocused = null;
  let current = { quoteMd: "", sources: [] };

  /* Markdown buttons wrap whatever is selected in the textarea. */
  const WRAP = { bold: ["**", "**"], italic: ["*", "*"], code: ["`", "`"], link: ["[", "](https://)"] };
  form.querySelectorAll("[data-md]").forEach((button) => {
    button.addEventListener("click", function () {
      const area = fields.body;
      const from = area.selectionStart;
      const to = area.selectionEnd;
      const picked = area.value.slice(from, to);
      let replacement;
      if (button.dataset.md === "list") {
        replacement = (picked || "item")
          .split("\n")
          .map((line) => (line.startsWith("- ") ? line : "- " + line))
          .join("\n");
      } else {
        const [before, after] = WRAP[button.dataset.md];
        replacement = before + picked + after;
      }
      area.setRangeText(replacement, from, to, "end");
      area.focus();
    });
  });

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

    current = { quoteMd: opts.quoteMd || "", sources: opts.sources || [] };
    const hasSelection = Boolean(opts.quote);

    /* Editing existing text only makes sense when text was selected. */
    editOption.disabled = !hasSelection;
    editOption.title = hasSelection ? "" : "Select the text you want changed, then right-click it";
    fields.kind.title = editOption.title;
    fields.kind.value = KINDS.some(([v]) => v === opts.kind) && !(opts.kind === "edit" && !hasSelection)
      ? opts.kind
      : "addition";

    fields.section.value = headingText(heading);
    sectionLabel.textContent =
      current.sources.length > 1 ? fields.section.value + " (spans several sections)" : fields.section.value;
    fields.page.value = heading && heading.id ? location.origin + location.pathname + "#" + heading.id : location.href;
    fields.source.value = opts.source || sourceFor(opts.node) || "";
    fields.title.value = opts.title || "";
    fields.body.value = opts.body || current.quoteMd || "";
    fields.quote.value = opts.quote || "";
    if (opts.quoteHtml) quoteLabel.innerHTML = opts.quoteHtml;
    else quoteLabel.textContent = fields.quote.value;
    quoteLabel.hidden = !fields.quote.value;
    fields.media.value = opts.mediaUrl || "";
    fields.body.placeholder =
      opts.kind === "media"
        ? "Anything worth knowing about the clip: who recorded it, what it shows."
        : "What should it say instead?";
    backdrop.hidden = false;
    document.body.style.overflow = "hidden";
    (opts.wantsFile && !fields.file.disabled ? fields.file : hasSelection ? fields.title : fields.body).focus();
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
      title: fields.title.value,
      section: fields.section.value,
      quote: fields.quote.value,
      quoteMd: current.quoteMd,
      body: fields.body.value,
      media: fields.media.value,
      author: fields.author.value,
      page: fields.page.value,
      source: fields.source.value,
      sources: current.sources,
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
    const range = selection.getRangeAt(0);
    const quoteMd = selectionMarkdown(range);
    const sources = sourcesFor(range);

    menu.hidden = false;
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    menu.style.left = Math.min(event.clientX, window.innerWidth - width - 8) + window.scrollX + "px";
    menu.style.top = Math.min(event.clientY, window.innerHeight - height - 8) + window.scrollY + "px";
    menu.firstChild.onclick = function () {
      hideMenu();
      open({
        kind: "edit",
        node: node,
        quote: text,
        quoteMd: quoteMd,
        quoteHtml: selectionHtml(range),
        sources: sources,
      });
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
