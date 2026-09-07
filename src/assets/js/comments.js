/**
 * Suggestion threads. Every suggestion is a GitHub issue labelled "suggestion" whose body
 * carries the quoted text in an anchor comment. The page reads open issues anonymously,
 * highlights the quote in place, and shows the issue and its comments in a side panel.
 * Replying happens on GitHub, so no login or token is needed here.
 *
 * Highlights are off by default and turned on with the header toggle, so readers get a clean
 * page and maintainers see the open threads.
 */
(function () {
  const cfg = window.SITE_CONFIG || {};
  const API = "https://api.github.com/repos/" + cfg.repo;
  const ANCHOR = /<!--\s*anchor:\s*(\{[\s\S]*?\})\s*-->/;
  const STORE = "suggestions-visible";
  const ICON =
    '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

  function norm(text) {
    return text.replace(/\s+/g, " ");
  }

  /* Text nodes of #main, flattened so a quote can span elements. */
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

  function markRange(index, from, to, issue) {
    index.nodes.forEach((entry) => {
      const start = entry.start;
      const end = start + norm(entry.node.nodeValue).length;
      if (end <= from || start >= to) return;
      const node = entry.node;
      const localFrom = Math.max(0, from - start);
      const localTo = Math.min(node.nodeValue.length, to - start);
      const range = document.createRange();
      range.setStart(node, Math.min(localFrom, node.nodeValue.length));
      range.setEnd(node, Math.min(localTo, node.nodeValue.length));
      const mark = document.createElement("mark");
      mark.className = "suggestion-mark";
      mark.dataset.issue = issue.number;
      mark.title = issue.comments + 1 + " comment" + (issue.comments === 0 ? "" : "s");
      try {
        range.surroundContents(mark);
      } catch (_) {
        /* skip fragments that cross element boundaries mid-node */
      }
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
    <footer><a class="btn primary" target="_blank" rel="noopener" data-thread-reply>Reply on GitHub</a></footer>`;
  document.body.appendChild(panel);

  const panelTitle = panel.querySelector("[data-thread-title]");
  const panelBody = panel.querySelector(".thread-body");
  const panelReply = panel.querySelector("[data-thread-reply]");
  panel.querySelector("[data-thread-close]").addEventListener("click", closePanel);
  document.addEventListener("keydown", (e) => e.key === "Escape" && closePanel());

  function closePanel() {
    panel.hidden = true;
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
    wrap.append(head, Object.assign(document.createElement("p"), { textContent: text }));
    return wrap;
  }

  function issueText(body) {
    return body
      .replace(ANCHOR, "")
      .replace(/^\*\*[^\n]*\n/gm, "")
      .replace(/^>.*$/gm, "")
      .replace(/^---$/gm, "")
      .trim();
  }

  async function openThread(issue) {
    panel.hidden = false;
    document.body.classList.add("thread-open");
    panelTitle.textContent = issue.title;
    panelReply.href = issue.html_url;
    const quoted = Object.assign(document.createElement("blockquote"), {
      className: "thread-quote",
      textContent: issue.__quote || "",
    });
    panelBody.replaceChildren(
      quoted,
      comment(issue.user ? issue.user.login : "anonymous", issue.user && issue.user.avatar_url, issue.created_at, issueText(issue.body || ""))
    );
    if (!issue.comments) return;

    const loading = Object.assign(document.createElement("p"), { className: "thread-loading", textContent: "Loading replies…" });
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

  /* ---------- load ---------- */

  function unmark(main) {
    main.querySelectorAll(".suggestion-mark").forEach((mark) => {
      const parent = mark.parentNode;
      mark.replaceWith(...mark.childNodes);
      parent.normalize();
    });
  }

  let bound = false;

  async function load() {
    const main = document.getElementById("main");
    if (!main || !cfg.repo) return;
    unmark(main);

    let issues;
    try {
      const response = await fetch(API + "/issues?state=open&labels=suggestion&per_page=100");
      if (!response.ok) return;
      issues = await response.json();
    } catch (_) {
      return;
    }

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
    button.innerHTML = ICON;
    button.title = on ? "Hide suggestions" : "Show suggestions";
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

  document.addEventListener("DOMContentLoaded", function () {
    const button = document.getElementById("suggestions-toggle");
    if (!button) return;
    let on = localStorage.getItem(STORE) === "1";
    apply(button, on);
    button.addEventListener("click", function () {
      on = !on;
      localStorage.setItem(STORE, on ? "1" : "0");
      apply(button, on);
    });
  });
})();
