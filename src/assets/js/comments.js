/**
 * Suggestion threads. Every suggestion is a GitHub issue labelled "suggestion" whose body
 * carries the quoted text in an anchor comment. The page reads open issues anonymously,
 * highlights the quote in place, and shows the thread in a side panel: an edit renders as a
 * red/green diff, everything else as light markdown.
 *
 * Reading needs no login. Signing in with GitHub (OAuth through the worker) allows replying
 * from the panel; everyone else follows the link to the issue.
 *
 * Highlights are on by default for maintainers (repo write access) and off for everyone else;
 * the header toggle overrides that per browser.
 */
(function () {
  const cfg = window.SITE_CONFIG || {};
  const API = "https://api.github.com/repos/" + cfg.repo;
  const ANCHOR = /<!--\s*anchor:\s*(\{[\s\S]*?\})\s*-->/;
  const STORE = "suggestions-visible";
  const CACHE = "suggestions-cache";
  const CACHE_MS = 3 * 60 * 1000;
  const AUTH = (cfg.endpoint || "").replace(/\/$/, "") + "/auth";
  let session = { signedIn: false };
  const SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  const ICON = SVG + '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  /* Shown while suggestions are on: the button then turns them off. */
  const ICON_OFF =
    SVG +
    '<path d="M21 15V5a2 2 0 0 0-2-2H9"/><path d="M3.6 3.6A2 2 0 0 0 3 5v16l4-4h10"/><path d="m2 2 20 20"/></svg>';

  /* Header buttons are icon-only until the phone menu, where the label is the row's text. */
  function label(text) {
    return '<span class="btn-label">' + text + "</span>";
  }

  function norm(text) {
    return text.replace(/\s+/g, " ");
  }

  /* ---------- markdown, enough of it for issue bodies ---------- */

  function escapeHtml(text) {
    return text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  function inlineMarkdown(text) {
    return escapeHtml(text)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>")
      .replace(/(^|[\s(])_([^_\n]+)_/g, "$1<em>$2</em>")
      .replace(/~~([^~]+)~~/g, "<del>$1</del>")
      .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/\n/g, "<br>");
  }

  /* Splits an issue body into its diff, its metadata table and the rest. */
  function parseBody(raw) {
    const body = raw.replace(ANCHOR, "");
    const meta = [];
    const text = [];
    const diff = { before: [], after: [] };
    let inFence = false;

    body.split("\n").forEach((line) => {
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        return;
      }
      if (inFence) {
        if (line.startsWith("-")) diff.before.push(line.slice(1).replace(/^ /, ""));
        else if (line.startsWith("+")) diff.after.push(line.slice(1).replace(/^ /, ""));
        return;
      }
      const row = /^\|\s*([^|]*?)\s*\|\s*(.*?)\s*\|$/.exec(line);
      if (row) {
        if (row[1] && !/^-+$/.test(row[1]) && row[2]) meta.push([row[1], row[2]]);
        return;
      }
      /* Older issues used "**Section:** value" lines and a trailing italic note. */
      const pair = /^\*\*([^*]+):\*\*\s*(.*)$/.exec(line);
      if (pair) {
        meta.push([pair[1], pair[2]]);
        return;
      }
      if (/^_.*_$/.test(line.trim()) || /^>/.test(line) || /^---$/.test(line.trim())) return;
      text.push(line);
    });

    return { meta, diff, text: text.join("\n").trim() };
  }

  function diffBlock(diff) {
    const wrap = document.createElement("div");
    wrap.className = "diff";
    diff.before.forEach((line) => wrap.append(diffLine("del", line)));
    diff.after.forEach((line) => wrap.append(diffLine("add", line)));
    return wrap;
  }

  function diffLine(kind, line) {
    const el = document.createElement("div");
    el.className = "diff-line " + kind;
    el.innerHTML = inlineMarkdown(line || " ");
    return el;
  }

  function metaBlock(meta) {
    const list = document.createElement("dl");
    list.className = "thread-meta";
    meta.forEach(([key, value]) => {
      list.append(
        Object.assign(document.createElement("dt"), { textContent: key }),
        Object.assign(document.createElement("dd"), { innerHTML: inlineMarkdown(value) })
      );
    });
    return list;
  }

  /* ---------- highlighting ---------- */

  function textIndex(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) =>
        node.parentElement.closest("script, style, .media, .thread-panel")
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT,
    });
    const nodes = [];
    let text = "";
    let node;
    while ((node = walker.nextNode())) {
      nodes.push({ node, start: text.length });
      text += norm(node.nodeValue);
    }
    return { nodes, text };
  }

  /* A quote crossing element boundaries needs one mark per text node; they are styled as one. */
  function markRange(index, from, to, issue) {
    const marks = [];
    index.nodes.forEach((entry) => {
      const start = entry.start;
      const end = start + norm(entry.node.nodeValue).length;
      if (end <= from || start >= to) return;
      const node = entry.node;
      const range = document.createRange();
      range.setStart(node, Math.min(Math.max(0, from - start), node.nodeValue.length));
      range.setEnd(node, Math.min(to - start, node.nodeValue.length));
      const mark = document.createElement("mark");
      mark.className = "suggestion-mark";
      mark.dataset.issue = issue.number;
      mark.title = issue.title;
      try {
        range.surroundContents(mark);
        marks.push(mark);
      } catch (_) {
        /* skip fragments that cross element boundaries mid-node */
      }
    });
    if (marks.length) {
      marks[0].classList.add("mark-start");
      marks[marks.length - 1].classList.add("mark-end");
    }
  }

  function unmark(main) {
    main.querySelectorAll(".suggestion-mark").forEach((mark) => {
      const parent = mark.parentNode;
      mark.replaceWith(...mark.childNodes);
      parent.normalize();
    });
  }

  /* ---------- side panel ---------- */

  const panel = document.createElement("aside");
  panel.className = "thread-panel";
  panel.hidden = true;
  panel.innerHTML = `
    <header>
      <strong data-thread-title></strong>
      <button type="button" class="icon-btn" data-thread-close aria-label="Close">&times;</button>
    </header>
    <div class="thread-body"></div>
    <footer>
      <form class="thread-reply" hidden>
        <textarea name="body" rows="3" placeholder="Reply" required></textarea>
        <button type="submit" class="btn primary">Reply</button>
      </form>
      <a class="btn primary" target="_blank" rel="noopener" data-thread-reply>Reply on GitHub</a>
    </footer>`;
  document.body.appendChild(panel);

  const panelTitle = panel.querySelector("[data-thread-title]");
  const panelBody = panel.querySelector(".thread-body");
  if (window.watchScrollFade) window.watchScrollFade(panelBody, 45);
  const panelReply = panel.querySelector("[data-thread-reply]");
  const replyForm = panel.querySelector(".thread-reply");
  let openIssue = null;

  panel.querySelector("[data-thread-close]").addEventListener("click", closePanel);
  document.addEventListener("keydown", (e) => e.key === "Escape" && closePanel());

  function closePanel() {
    if (panel.hidden) return;
    panel.classList.remove("is-open");
    window.setTimeout(() => {
      if (!panel.classList.contains("is-open")) panel.hidden = true;
    }, 260);
    document.body.classList.remove("thread-open");
    document.querySelectorAll(".suggestion-mark.active").forEach((m) => m.classList.remove("active"));
  }

  function comment(author, avatar, date, text) {
    const wrap = document.createElement("article");
    wrap.className = "thread-comment";
    const head = document.createElement("header");
    if (avatar) head.append(Object.assign(document.createElement("img"), { src: avatar, alt: "" }));
    head.append(
      Object.assign(document.createElement("span"), { className: "who", textContent: author }),
      Object.assign(document.createElement("time"), { textContent: new Date(date).toLocaleDateString() })
    );
    wrap.append(head);

    const parsed = parseBody(text || "");
    if (parsed.diff.before.length || parsed.diff.after.length) wrap.append(diffBlock(parsed.diff));
    if (parsed.text) {
      wrap.append(
        Object.assign(document.createElement("div"), {
          className: "thread-text",
          innerHTML: inlineMarkdown(parsed.text),
        })
      );
    }
    if (parsed.meta.length) wrap.append(metaBlock(parsed.meta));
    return wrap;
  }

  replyForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    const field = replyForm.querySelector("textarea");
    const text = field.value.trim();
    if (!text || !openIssue) return;
    const button = replyForm.querySelector("button");
    button.disabled = true;
    try {
      const response = await fetch(AUTH + "/comment", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issue: openIssue.number, body: text }),
      });
      if (!response.ok) throw new Error();
      const { comment: posted } = await response.json();
      panelBody.append(comment(posted.user.login, posted.user.avatar_url, posted.created_at, posted.body));
      field.value = "";
      openIssue.comments += 1;
      /* Keep the sessionStorage cache in step so a reload within the cache window still fetches
         replies instead of hitting the early return in openThread on a stale comments: 0. */
      try {
        const cached = JSON.parse(sessionStorage.getItem(CACHE) || "null");
        if (cached) {
          const cachedIssue = cached.issues.find((i) => i.number === openIssue.number);
          if (cachedIssue) cachedIssue.comments = (cachedIssue.comments || 0) + 1;
          sessionStorage.setItem(CACHE, JSON.stringify(cached));
        }
      } catch (_) {
        /* corrupt cache is harmless; it just refetches next time */
      }
    } catch (_) {
      panelBody.append(
        Object.assign(document.createElement("p"), {
          className: "thread-loading",
          textContent: "That reply did not go through. Open the thread on GitHub.",
        })
      );
    }
    button.disabled = false;
  });

  async function openThread(issue) {
    openIssue = issue;
    panel.hidden = false;
    requestAnimationFrame(() => panel.classList.add("is-open"));
    replyForm.hidden = !session.signedIn;
    panelReply.hidden = session.signedIn;
    document.body.classList.add("thread-open");
    panelTitle.textContent = issue.title;
    panelReply.href = issue.html_url;

    panelBody.replaceChildren(
      comment(
        issue.user ? issue.user.login : "anonymous",
        issue.user && issue.user.avatar_url,
        issue.created_at,
        issue.body || ""
      )
    );
    if (!issue.comments) return;

    const loading = Object.assign(document.createElement("p"), {
      className: "thread-loading",
      textContent: "Loading replies…",
    });
    panelBody.append(loading);
    try {
      const response = await fetch(issue.comments_url);
      if (!response.ok) throw new Error();
      const comments = await response.json();
      loading.remove();
      comments.forEach((c) => panelBody.append(comment(c.user.login, c.user.avatar_url, c.created_at, c.body)));
    } catch (_) {
      loading.textContent = "Could not load the replies. Open the thread on GitHub.";
    }
  }

  /* ---------- loading issues ---------- */

  /* The API allows 60 anonymous calls an hour per address, so results are cached briefly and
     a rate-limited response falls back to the last good list rather than dropping highlights. */
  async function fetchIssues() {
    let cached = null;
    try {
      cached = JSON.parse(sessionStorage.getItem(CACHE) || "null");
    } catch (_) {
      /* ignore a corrupt cache */
    }
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.issues;

    try {
      const response = await fetch(API + "/issues?state=open&labels=suggestion&per_page=100");
      if (!response.ok) return cached ? cached.issues : null;
      const issues = await response.json();
      try {
        sessionStorage.setItem(CACHE, JSON.stringify({ at: Date.now(), issues }));
      } catch (_) {
        /* storage full or disabled, fine */
      }
      return issues;
    } catch (_) {
      return cached ? cached.issues : null;
    }
  }

  let bound = false;

  async function load() {
    const main = document.getElementById("main");
    if (!main || !cfg.repo) return;
    unmark(main);

    const issues = await fetchIssues();
    if (!issues) return;

    const index = textIndex(main);
    const byNumber = new Map();

    issues.forEach((issue) => {
      const match = ANCHOR.exec(issue.body || "");
      if (!match) return;
      let quote;
      try {
        quote = norm(JSON.parse(match[1]).quote || "");
      } catch (_) {
        return;
      }
      if (quote.length < 4) return;
      const at = index.text.indexOf(quote);
      if (at === -1) return;
      issue.__quote = quote;
      byNumber.set(String(issue.number), issue);
      markRange(index, at, at + quote.length, issue);
    });

    if (bound) return;
    bound = true;
    main.addEventListener("click", function (event) {
      const mark = event.target.closest(".suggestion-mark");
      if (!mark) return;
      const issue = byNumber.get(mark.dataset.issue);
      if (!issue) return;
      document.querySelectorAll(".suggestion-mark.active").forEach((m) => m.classList.remove("active"));
      document
        .querySelectorAll('.suggestion-mark[data-issue="' + mark.dataset.issue + '"]')
        .forEach((m) => m.classList.add("active"));
      openThread(issue);
    });
  }

  function apply(button, on) {
    button.title = on ? "Hide suggestions" : "Show suggestions";
    button.innerHTML = (on ? ICON_OFF : ICON) + label(button.title);
    button.setAttribute("aria-label", button.title);
    button.setAttribute("aria-pressed", String(on));
    button.classList.toggle("on", on);
    if (on) {
      load();
    } else {
      const main = document.getElementById("main");
      if (main) unmark(main);
      closePanel();
    }
  }

  /* ---------- sign-in ---------- */

  function renderAuth(button) {
    if (!cfg.endpoint) {
      button.hidden = true;
      return;
    }
    button.hidden = false;
    /* log-in / log-out, icon only with the state in the tooltip. */
    button.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (session.signedIn
        ? '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>'
        : '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" x2="3" y1="12" y2="12"/>') +
      "</svg>" +
      label(session.signedIn ? "Sign out" : "Sign in");
    button.title = session.signedIn
      ? "Signed in as " + session.login + (session.canWrite ? " (maintainer)" : "") + ". Click to sign out."
      : "Sign in with GitHub";
  }

  async function whoami() {
    if (!cfg.endpoint) return;
    try {
      const response = await fetch(AUTH + "/me", { credentials: "include" });
      if (response.ok) session = await response.json();
    } catch (_) {
      /* stay signed out */
    }
    /* Other scripts (the missing-image prompt) need to know who is signed in without asking
       the worker a second time. */
    window.siteSession = session;
    document.dispatchEvent(new CustomEvent("site-session", { detail: session }));
  }

  document.addEventListener("DOMContentLoaded", async function () {
    const button = document.getElementById("suggestions-toggle");
    const authButton = document.getElementById("auth-btn");
    if (authButton) {
      authButton.hidden = true;
      authButton.addEventListener("click", async function () {
        if (!session.signedIn) {
          window.location.href = AUTH + "/login?return=" + encodeURIComponent(window.location.href);
          return;
        }
        await fetch(AUTH + "/logout", { method: "POST", credentials: "include" });
        window.location.reload();
      });
    }

    await whoami();
    if (authButton) renderAuth(authButton);
    if (!button) return;

    const stored = localStorage.getItem(STORE);
    let on = stored === null ? Boolean(session.canWrite) : stored === "1";
    apply(button, on);
    button.addEventListener("click", function () {
      on = !on;
      localStorage.setItem(STORE, on ? "1" : "0");
      apply(button, on);
    });
  });
})();
