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
    heading: '<path d="M6 12h12"/><path d="M6 20V4"/><path d="M18 20V4"/>',
    heading1: '<path d="M4 12h8"/><path d="M4 18V6"/><path d="M12 18V6"/><path d="m17 12 3-2v8"/>',
    heading2: '<path d="M4 12h8"/><path d="M4 18V6"/><path d="M12 18V6"/><path d="M21 18h-4c0-4 4-3 4-6 0-1.5-2-2.5-4-1"/>',
    heading3: '<path d="M4 12h8"/><path d="M4 18V6"/><path d="M12 18V6"/><path d="M17.5 10.5c1.7-1 3.5 0 3.5 1.5a2 2 0 0 1-2 2"/><path d="M17 17.5c2 1.5 4 .3 4-1.5a2 2 0 0 0-2-2"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
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
  function toMarkdown(node, depth) {
    depth = depth || 0;
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue;
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    if (node.classList.contains("media") || node.classList.contains("clip-group")) return "";
    const inner = Array.from(node.childNodes)
      .map((child) => toMarkdown(child, depth))
      .join("");
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
      /* Nested levels are indented one space each and stay flush with their parent item. */
      case "LI": {
        let text = "";
        let nested = "";
        Array.from(node.childNodes).forEach((child) => {
          if (child.nodeType === Node.ELEMENT_NODE && (child.tagName === "UL" || child.tagName === "OL")) {
            nested += toMarkdown(child, depth + 1);
          } else {
            text += toMarkdown(child, depth);
          }
        });
        return " ".repeat(depth) + "- " + text.replace(/\s+/g, " ").trim() + "\n" + nested;
      }
      case "BR":
        return "\n";
      case "H2":
      case "H3":
      case "H4":
        return "#".repeat(Number(node.tagName[1])) + " " + inner.trim() + "\n\n";
      case "UL":
      case "OL":
        return depth > 0 ? inner : inner.replace(/\n+$/, "") + "\n\n";
      case "P":
      case "DIV":
      case "BLOCKQUOTE":
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
      <div class="quote-wrap">
        <blockquote class="quote-line" data-quote-label hidden></blockquote>
      </div>

      <label for="sg-title">Title <abbr title="required">*</abbr></label>
      <input id="sg-title" name="title" required placeholder="Fix capitalisation">

      <label for="sg-kind">Type <abbr title="required">*</abbr></label>
      <div class="select-wrap">
        <select id="sg-kind" name="kind" tabindex="-1" aria-hidden="true">
          ${KINDS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}
        </select>
        <button type="button" class="select-btn" aria-haspopup="listbox" aria-expanded="false" aria-label="Type">
          <span data-select-label></span>
          <svg class="select-chevron" xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
        </button>
        <ul class="select-list" role="listbox" hidden>
          ${KINDS.map(
            ([v, l]) =>
              `<li role="option" aria-selected="false" tabindex="-1" data-value="${v}">${l}</li>`
          ).join("")}
        </ul>
      </div>

      <label for="sg-body">Suggestion <abbr title="required">*</abbr></label>
      <div class="editor-bar">
        <div class="editor-tabs" role="tablist">
          <button type="button" class="tab is-active" data-tab="write" role="tab" aria-selected="true">Write</button>
          <button type="button" class="tab" data-tab="preview" role="tab" aria-selected="false">Preview</button>
        </div>
        <div class="md-toolbar" role="toolbar" aria-label="Formatting">
          <button type="button" class="icon-btn" data-md="bold" title="Bold" aria-label="Bold">${icon("bold")}</button>
          <button type="button" class="icon-btn" data-md="italic" title="Italic" aria-label="Italic">${icon("italic")}</button>
          <button type="button" class="icon-btn" data-md="code" title="Code" aria-label="Code">${icon("code")}</button>
          <button type="button" class="icon-btn" data-md="link" title="Link" aria-label="Link">${icon("link")}</button>
          <button type="button" class="icon-btn" data-md="list" title="Bulleted list" aria-label="Bulleted list">${icon("list")}</button>
          <span class="heading-group">
            <button type="button" class="icon-btn" data-heading-toggle title="Heading" aria-label="Heading" aria-expanded="false">${icon("heading")}</button>
            <span class="heading-levels">
              <button type="button" class="icon-btn" data-md="h1" title="Heading 1" aria-label="Heading 1">${icon("heading1")}</button>
              <button type="button" class="icon-btn" data-md="h2" title="Heading 2" aria-label="Heading 2">${icon("heading2")}</button>
              <button type="button" class="icon-btn" data-md="h3" title="Heading 3" aria-label="Heading 3">${icon("heading3")}</button>
            </span>
          </span>
        </div>
      </div>
      <div class="editor-swap">
        <div class="editor-area">
          <div class="editor-highlight" aria-hidden="true"></div>
          <textarea id="sg-body" name="body" required spellcheck="true"></textarea>
        </div>
        <div class="editor-preview" hidden></div>
      </div>

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
  const highlight = form.querySelector(".editor-highlight");
  const preview = form.querySelector(".editor-preview");
  const toolbar = form.querySelector(".md-toolbar");
  const editorArea = form.querySelector(".editor-area");
  const editorSwap = form.querySelector(".editor-swap");
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
  /* A listbox of our own: the native popup is drawn by the OS and ignores the site's styling.
     The real <select> stays in the form so its value and validation keep working. */
  const selectWrap = form.querySelector(".select-wrap");
  const selectBtn = selectWrap.querySelector(".select-btn");
  const selectLabel = selectWrap.querySelector("[data-select-label]");
  const selectList = selectWrap.querySelector(".select-list");
  const selectOptions = Array.from(selectList.children);

  function syncSelect() {
    const chosen = form.querySelector("#sg-kind");
    selectLabel.textContent = chosen.options[chosen.selectedIndex].textContent;
    selectOptions.forEach((option) => {
      const native = chosen.querySelector(`option[value="${option.dataset.value}"]`);
      option.setAttribute("aria-selected", String(option.dataset.value === chosen.value));
      option.classList.toggle("is-disabled", native.disabled);
      option.title = native.title;
    });
  }

  function openSelect(open) {
    selectList.hidden = !open;
    selectWrap.classList.toggle("is-open", open);
    selectBtn.setAttribute("aria-expanded", String(open));
  }

  selectBtn.addEventListener("click", () => openSelect(selectList.hidden));
  selectOptions.forEach((option) => {
    option.addEventListener("click", function () {
      if (option.classList.contains("is-disabled")) return;
      form.querySelector("#sg-kind").value = option.dataset.value;
      syncSelect();
      openSelect(false);
      selectBtn.focus();
    });
  });
  document.addEventListener("click", function (event) {
    if (!selectList.hidden && !selectWrap.contains(event.target)) openSelect(false);
  });

  uploadHint.textContent = cfg.endpoint ? `(up to ${cfg.maxUploadMB} MB)` : "(uploads not enabled yet)";
  fields.file.disabled = !cfg.endpoint;

  let lastFocused = null;
  let current = { quoteMd: "", sources: [] };

  function escapeHtml(text) {
    return text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  }

  /* A long quote is folded behind a fade until asked for. */
  const quoteMore = document.createElement("button");
  quoteMore.type = "button";
  quoteMore.className = "btn tiny quote-more";
  quoteMore.hidden = true;
  quoteLabel.parentNode.appendChild(quoteMore);
  /* Folding animates between two real heights: a max-height jumping to a huge value would
     spend most of the transition on empty space. */
  const QUOTE_FOLDED = 190;
  quoteMore.addEventListener("click", function () {
    const open = !quoteLabel.classList.contains("is-open");
    quoteLabel.classList.toggle("is-open", open);
    quoteLabel.parentNode.classList.toggle("is-folded", !open);
    quoteMore.textContent = open ? "Show less" : "Show more";
    /* Closing has to start from the height it grew to: max-height cannot animate out of none. */
    quoteLabel.style.maxHeight = quoteLabel.scrollHeight + "px";
    if (!open) {
      void quoteLabel.offsetHeight;
      quoteLabel.style.maxHeight = QUOTE_FOLDED + "px";
    }
  });

  quoteLabel.addEventListener("transitionend", function (event) {
    /* Let a grown quote keep following its content once it has finished opening. */
    if (event.propertyName === "max-height" && quoteLabel.classList.contains("is-open")) {
      quoteLabel.style.maxHeight = "none";
    }
  });

  function foldQuote() {
    quoteLabel.classList.remove("is-open");
    quoteLabel.style.maxHeight = "";
    quoteMore.textContent = "Show more";
    const clipped = !quoteLabel.hidden && quoteLabel.scrollHeight > quoteLabel.clientHeight + 4;
    quoteMore.hidden = !clipped;
    quoteLabel.parentNode.classList.toggle("is-folded", clipped);
  }

  /* The layer behind the textarea: the same characters, with markdown styled in place, so
     **bold** reads bold while its asterisks stay visible and the caret stays aligned. */
  function paint() {
    highlight.innerHTML =
      escapeHtml(fields.body.value)
        .replace(/(`[^`\n]+`)/g, "<code>$1</code>")
        .replace(/(\*\*[^*\n]+\*\*)/g, "<strong>$1</strong>")
        .replace(/(^|[^*])(\*[^*\n]+\*)/g, "$1<em>$2</em>")
        .replace(/(~~[^~\n]+~~)/g, "<del>$1</del>")
        .replace(/(\[[^\]\n]+\]\([^)\n]*\))/g, '<span class="md-link">$1</span>')
        .replace(/^(#{1,4} .*)$/gm, '<span class="md-heading">$1</span>')
        .replace(/^(\s*[-*] )/gm, '<span class="md-mark">$1</span>') + "\n";
  }

  /* Preview tab: the same light markdown, rendered. */
  function renderPreview() {
    const blocks = fields.body.value.split(/\n{2,}/);
    preview.innerHTML =
      blocks
        .map((block) => {
          const lines = block.split("\n");
          if (lines.every((line) => /^\s*[-*] /.test(line))) return list(lines);
          const heading = /^(#{1,4}) (.*)$/.exec(lines[0]);
          if (heading && lines.length === 1) {
            const level = heading[1].length + 1;
            return `<h${level}>${inline(heading[2])}</h${level}>`;
          }
          return "<p>" + inline(block).replace(/\n/g, "<br>") + "</p>";
        })
        .join("") || '<p class="hint">Nothing to preview yet.</p>';
  }

  /* Bullet lines nest by their leading spaces, one space per level. */
  function list(lines) {
    let html = "";
    let depth = 0;
    lines.forEach((line) => {
      const indent = /^\s*/.exec(line)[0].length;
      while (indent > depth) {
        html += "<ul>";
        depth += 1;
      }
      while (indent < depth) {
        html += "</ul>";
        depth -= 1;
      }
      html += "<li>" + inline(line.replace(/^\s*[-*] /, "")) + "</li>";
    });
    return "<ul>" + html + "</ul>".repeat(depth + 1);
  }

  function inline(text) {
    return escapeHtml(text)
      .replace(/`([^`\n]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
      .replace(/~~([^~\n]+)~~/g, "<del>$1</del>")
      .replace(/\[([^\]\n]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  }

  /* Swapping tabs animates the box's height only; the text itself just fades. */
  function showTab(name) {
    const writing = name === "write";
    const from = editorSwap.offsetHeight;
    editorArea.hidden = !writing;
    toolbar.hidden = !writing;
    preview.hidden = writing;
    if (!writing) renderPreview();
    editorSwap.style.height = "auto";
    const to = editorSwap.offsetHeight;
    if (from && to !== from) {
      editorSwap.style.height = from + "px";
      requestAnimationFrame(() => {
        editorSwap.style.height = to + "px";
      });
    } else {
      editorSwap.style.height = "";
    }
    form.querySelectorAll(".editor-tabs .tab").forEach((tab) => {
      const on = tab.dataset.tab === name;
      tab.classList.toggle("is-active", on);
      tab.setAttribute("aria-selected", String(on));
    });
  }

  form.querySelectorAll(".editor-tabs .tab").forEach((tab) => {
    tab.addEventListener("click", () => showTab(tab.dataset.tab));
  });

  /* Once the height transition lands, hand the box back to its content. */
  editorSwap.addEventListener("transitionend", function (event) {
    if (event.propertyName === "height") editorSwap.style.height = "";
  });

  /* The textarea follows its content; the modal only scrolls once it runs out of screen, and
     widens for long lines. */
  function grow() {
    const area = fields.body;
    paint();
    /* Width first: measuring the height in a narrower box counts lines that the wider box
       will not wrap, and the leftover space stays under the text. */
    const longest = Math.max(...(current.quoteMd || fields.body.value || "").split("\n").map((l) => l.length), 0);
    const width = longest > 90 ? Math.min(1100, 680 + (longest - 90) * 6) : 680;
    form.style.setProperty("--modal-w", width + "px");
    area.style.height = "auto";
    area.style.height = area.scrollHeight + "px";
  }
  fields.body.addEventListener("input", grow);

  /* Markdown buttons wrap whatever is selected. Inserting through execCommand keeps the
     browser's own undo stack, which setRangeText would throw away. */
  const WRAP = { bold: ["**", "**"], italic: ["*", "*"], code: ["`", "`"], link: ["[", "](https://)"] };
  const HEADINGS = { h1: "# ", h2: "## ", h3: "### " };
  function insert(area, text) {
    area.focus();
    if (!document.execCommand || !document.execCommand("insertText", false, text)) {
      const from = area.selectionStart;
      const to = area.selectionEnd;
      area.setRangeText(text, from, to, "end");
    }
  }
  form.querySelectorAll("[data-md]").forEach((button) => {
    button.addEventListener("click", function () {
      const area = fields.body;
      const picked = area.value.slice(area.selectionStart, area.selectionEnd);
      let replacement;
      if (HEADINGS[button.dataset.md]) {
        replacement = HEADINGS[button.dataset.md] + (picked || "Heading");
      } else if (button.dataset.md === "list") {
        replacement = (picked || "item")
          .split("\n")
          .map((line) => (line.startsWith("- ") ? line : "- " + line))
          .join("\n");
      } else {
        const [before, after] = WRAP[button.dataset.md];
        replacement = before + picked + after;
      }
      insert(area, replacement);
      grow();
    });
  });

  /* The heading button unrolls H1-H3 to its right. */
  const headingGroup = form.querySelector(".heading-group");
  const headingToggle = form.querySelector("[data-heading-toggle]");
  headingToggle.addEventListener("click", function () {
    const open = headingGroup.classList.toggle("is-open");
    headingToggle.setAttribute("aria-expanded", String(open));
  });
  headingGroup.querySelectorAll("[data-md]").forEach((button) => {
    button.addEventListener("click", function () {
      headingGroup.classList.remove("is-open");
      headingToggle.setAttribute("aria-expanded", "false");
    });
  });

  /* What the box held when it opened, so Cancel can tell edits from an untouched form. */
  let pristine = "";

  function dirty() {
    return (
      fields.body.value !== pristine ||
      fields.title.value.trim() !== "" ||
      fields.media.value.trim() !== "" ||
      fields.author.value.trim() !== "" ||
      Boolean(fields.file.files && fields.file.files.length)
    );
  }

  /* Our own discard dialog: the browser's confirm() names the site and looks nothing like the page. */
  const discard = document.createElement("div");
  discard.className = "modal-backdrop discard-backdrop";
  discard.hidden = true;
  discard.innerHTML = `
    <div class="modal discard-modal" role="alertdialog" aria-modal="true" aria-labelledby="sg-discard-title">
      <h2 id="sg-discard-title">Discard this suggestion?</h2>
      <p>Everything you have written here will be lost.</p>
      <div class="modal-actions">
        <button type="button" class="btn" data-discard="no">Keep editing</button>
        <button type="button" class="btn danger" data-discard="yes">Discard</button>
      </div>
    </div>`;
  document.body.appendChild(discard);

  function askDiscard() {
    discard.hidden = false;
    requestAnimationFrame(() => discard.classList.add("is-open"));
    discard.querySelector('[data-discard="no"]').focus();
  }

  function hideDiscard() {
    discard.classList.remove("is-open");
    window.setTimeout(() => {
      discard.hidden = true;
    }, 150);
  }

  discard.querySelector('[data-discard="no"]').addEventListener("click", hideDiscard);
  discard.querySelector('[data-discard="yes"]').addEventListener("click", function () {
    hideDiscard();
    close(true);
  });

  function close(force) {
    if (!force && dirty()) {
      askDiscard();
      return;
    }
    backdrop.classList.add("is-closing");
    window.setTimeout(function () {
      backdrop.hidden = true;
      backdrop.classList.remove("is-closing", "is-open");
      document.body.style.overflow = "";
      if (lastFocused) lastFocused.focus();
    }, 150);
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
    syncSelect();
    openSelect(false);

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
    quoteLabel.classList.remove("is-open");
    fields.media.value = opts.mediaUrl || "";
    fields.body.placeholder =
      opts.kind === "media"
        ? "Anything worth knowing about the clip: who recorded it, what it shows."
        : "What should it say instead?";
    backdrop.hidden = false;
    backdrop.classList.remove("is-closing");
    requestAnimationFrame(() => backdrop.classList.add("is-open"));
    document.body.style.overflow = "hidden";
    showTab("write");
    grow();
    foldQuote();
    pristine = fields.body.value;
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
      setTimeout(() => close(true), 1500);
    } catch (error) {
      status.className = "status error";
      status.innerHTML =
        "That did not go through (" + error.message + '). Try again, or post it in <a href="' +
        cfg.discordUrl + '" target="_blank" rel="noopener">Discord</a>.';
    }
  });

  /* Clicking the backdrop leaves the box alone: losing a half-written suggestion to a stray
     click is worse than one extra click to cancel. */
  form.querySelector("[data-suggest-close]").addEventListener("click", () => close(false));
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!discard.hidden) hideDiscard();
    else if (!selectList.hidden) openSelect(false);
    else if (!backdrop.hidden) close(false);
  });
  window.addEventListener("suggest:open", (e) => open(e.detail || {}));

  /* ---------- right-click menu on a selection ---------- */

  const menu = document.createElement("div");
  menu.className = "context-menu";
  menu.hidden = true;
  menu.innerHTML =
    '<button type="button" data-action="suggest">Suggest</button>' +
    '<button type="button" data-action="copy">Copy</button>' +
    '<button type="button" data-action="copy-raw">Copy as Markdown</button>';
  document.body.appendChild(menu);
  const menuItems = {
    suggest: menu.querySelector('[data-action="suggest"]'),
    copy: menu.querySelector('[data-action="copy"]'),
    raw: menu.querySelector('[data-action="copy-raw"]'),
  };

  function hideMenu() {
    menu.hidden = true;
  }

  function copy(text, button, label) {
    const done = () => {
      button.textContent = "Copied";
      window.setTimeout(() => {
        button.textContent = label;
        hideMenu();
      }, 600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, hideMenu);
      return;
    }
    const holder = document.createElement("textarea");
    holder.value = text;
    document.body.appendChild(holder);
    holder.select();
    document.execCommand("copy");
    holder.remove();
    done();
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
    menuItems.suggest.onclick = function () {
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
    menuItems.copy.onclick = () => copy(text, menuItems.copy, "Copy");
    menuItems.raw.onclick = () => copy(quoteMd || text, menuItems.raw, "Copy as Markdown");
  });

  /* The copy items show "Copied" for a moment, so their clicks must not reach the document
     handler that dismisses the menu. */
  menu.addEventListener("click", (event) => event.stopPropagation());
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
