/**
 * Anonymous suggestions.
 *
 * Every heading gets a "suggest an edit" button. The modal pre-fills the exact
 * markdown for that heading (fetched from the repo's raw source) so anyone can
 * rewrite it in place — no GitHub account, no fork, no pull request.
 *
 * Submissions are POSTed as JSON to SITE_CONFIG.endpoint (a form service such as
 * Formspree/Tally/Basin, or your own worker). If no endpoint is configured the
 * modal falls back to copy-to-clipboard + a pre-filled GitHub issue link.
 */
(function () {
  const cfg = window.SITE_CONFIG || {};
  const rawBase = `https://raw.githubusercontent.com/${cfg.repo}/${cfg.branch}/src/`;
  const sourceCache = new Map();

  const KINDS = [
    ["edit", "Edit to an existing section"],
    ["addition", "New glitch / strat / tech"],
    ["media", "New or replacement video"],
    ["correction", "Correction (credit, name, link)"],
    ["other", "Something else"],
  ];

  function fetchSource(path) {
    if (!sourceCache.has(path)) {
      sourceCache.set(
        path,
        fetch(rawBase + path)
          .then((r) => (r.ok ? r.text() : ""))
          .catch(() => "")
      );
    }
    return sourceCache.get(path);
  }

  function headingText(h) {
    return h.textContent.replace(/\s*#\s*$/, "").trim();
  }

  /** Slice the markdown block belonging to `heading` (down to the next same-or-higher heading). */
  function sliceSection(markdown, heading) {
    if (!markdown) return "";
    const level = Number(heading.tagName[1]);
    const text = headingText(heading);
    const lines = markdown.split("\n");
    const start = lines.findIndex(
      (line) =>
        /^#{2,6}\s/.test(line) &&
        line.replace(/^#+\s*/, "").replace(/[*_`]/g, "").trim() === text.replace(/[*_`]/g, "").trim()
    );
    if (start === -1) return markdown.replace(/^---[\s\S]*?---\n/, "").trim();
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
      const m = /^(#{2,6})\s/.exec(lines[i]);
      if (m && m[1].length <= level) {
        end = i;
        break;
      }
    }
    return lines.slice(start, end).join("\n").trim();
  }

  function buildModal() {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.hidden = true;
    backdrop.innerHTML = `
      <form class="modal" method="dialog">
        <h2>Suggest a change</h2>
        <p class="hint">No account needed. Suggestions are reviewed by the maintainers before they go live.</p>

        <label for="sg-kind">What is this?</label>
        <select id="sg-kind" name="kind">
          ${KINDS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}
        </select>

        <label for="sg-section">Section</label>
        <input id="sg-section" name="section" readonly>

        <label for="sg-body">Your suggestion <span class="hint">— edit the markdown below, or just describe the change</span></label>
        <textarea id="sg-body" name="body" required></textarea>

        <label for="sg-media">Video link (YouTube, Discord, or a direct file we can mirror) — optional</label>
        <input id="sg-media" name="media" type="url" placeholder="https://">

        <label for="sg-author">Your name / handle for credit — optional</label>
        <input id="sg-author" name="author" placeholder="Anonymous">

        <input type="text" name="_gotcha" tabindex="-1" autocomplete="off" style="display:none" aria-hidden="true">
        <input type="hidden" name="page">
        <input type="hidden" name="source">

        <div class="modal-actions">
          <button type="button" class="btn" data-suggest-close>Cancel</button>
          <button type="button" class="btn" data-suggest-copy>Copy text</button>
          <button type="submit" class="btn primary">Send suggestion</button>
        </div>
        <p class="status" role="status"></p>
      </form>`;
    document.body.appendChild(backdrop);
    return backdrop;
  }

  const backdrop = buildModal();
  const form = backdrop.querySelector("form");
  const status = backdrop.querySelector(".status");
  const fields = {
    kind: form.querySelector("#sg-kind"),
    section: form.querySelector("#sg-section"),
    body: form.querySelector("#sg-body"),
    media: form.querySelector("#sg-media"),
    author: form.querySelector("#sg-author"),
    page: form.querySelector('input[name="page"]'),
    source: form.querySelector('input[name="source"]'),
  };
  let lastFocused = null;

  function close() {
    backdrop.hidden = true;
    document.body.style.overflow = "";
    if (lastFocused) lastFocused.focus();
  }

  function open(opts) {
    lastFocused = document.activeElement;
    status.textContent = "";
    status.className = "status";
    const kind = KINDS.some(([v]) => v === opts.kind) ? opts.kind : "addition";
    fields.kind.value = kind;
    fields.section.value = opts.section || "Whole page";
    fields.media.value = "";
    fields.author.value = "";
    fields.page.value = window.location.href;
    fields.source.value = opts.source || "";
    fields.body.value = opts.body || "";
    fields.body.placeholder =
      kind === "edit"
        ? "Rewrite this section as you think it should read."
        : "Describe the glitch/strat, where it is done, who found it, and link a video.";
    backdrop.hidden = false;
    document.body.style.overflow = "hidden";
    fields.body.focus();
  }

  function issueUrl() {
    const title = `[${fields.kind.value}] ${fields.section.value}`;
    const body = [
      `**Section:** ${fields.section.value}`,
      fields.source.value ? `**Source file:** \`src/${fields.source.value}\`` : "",
      fields.media.value ? `**Media:** ${fields.media.value}` : "",
      fields.author.value ? `**Credit:** ${fields.author.value}` : "",
      "",
      fields.body.value,
    ]
      .filter(Boolean)
      .join("\n");
    return `https://github.com/${cfg.repo}/issues/new?title=${encodeURIComponent(
      title
    )}&body=${encodeURIComponent(body)}`;
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (!fields.body.value.trim()) return;
    const payload = Object.fromEntries(new FormData(form).entries());
    payload.submittedAt = new Date().toISOString();

    if (!cfg.endpoint) {
      status.className = "status error";
      status.innerHTML =
        'No suggestion inbox is configured yet. Copy your text and ' +
        `<a href="${issueUrl()}" target="_blank" rel="noopener">open an issue</a> or paste it in the Discord.`;
      return;
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
      status.textContent = "Thanks! Your suggestion was sent to the maintainers.";
      setTimeout(close, 1800);
    } catch (error) {
      status.className = "status error";
      status.innerHTML =
        "Could not send that (" +
        error.message +
        "). Copy your text and " +
        `<a href="${issueUrl()}" target="_blank" rel="noopener">open an issue</a> instead.`;
    }
  });

  form.querySelector("[data-suggest-copy]").addEventListener("click", async function () {
    try {
      await navigator.clipboard.writeText(fields.body.value);
      status.className = "status ok";
      status.textContent = "Copied to clipboard.";
    } catch (_) {
      fields.body.select();
    }
  });

  form.querySelector("[data-suggest-close]").addEventListener("click", close);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !backdrop.hidden) close();
  });

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("[data-suggest-open]").forEach((btn) => {
      btn.addEventListener("click", () => open({ kind: btn.dataset.kind || "addition" }));
    });

    const main = document.getElementById("main");
    if (!main) return;

    main.querySelectorAll("h2, h3, h4").forEach((heading) => {
      const section = heading.closest(".doc-section");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn suggest-heading-btn";
      button.textContent = "suggest an edit";
      button.setAttribute("aria-label", "Suggest an edit to " + headingText(heading));
      button.addEventListener("click", async function () {
        const source = section ? section.dataset.source : "";
        open({ kind: "edit", section: headingText(heading), source: source, body: "Loading current text…" });
        const markdown = source ? await fetchSource(source) : "";
        fields.body.value =
          sliceSection(markdown, heading) || "## " + headingText(heading) + "\n\n";
      });
      heading.appendChild(button);
    });
  });
})();
