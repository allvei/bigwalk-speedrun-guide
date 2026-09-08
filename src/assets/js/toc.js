(function () {
  /* A heading landing right under the header sits inside the top fade, so a jump stops the
     header's height plus the fade's further down, and the same line decides which entry is
     the one being read. Both are measured, since the header wraps at narrow widths. */
  function jumpOffset() {
    const header = document.querySelector(".site-header");
    const fade = document.querySelector(".page-fade.at-top");
    const top = header ? header.getBoundingClientRect().height : 60;
    return top + (fade ? fade.getBoundingClientRect().height : 48) - 10;
  }

  document.addEventListener("DOMContentLoaded", function () {
    const nav = document.getElementById("toc-nav");
    const main = document.getElementById("main");
    if (!nav || !main) return;

    const headings = Array.from(main.querySelectorAll("h2[id], h3[id], h4[id]"));
    if (!headings.length) return;

    /* The list itself is rendered at build time; this only wires it up. */
    let list = nav.querySelector("ul");
    if (!list) {
      list = document.createElement("ul");
      headings.forEach((h) => {
        const li = document.createElement("li");
        li.className = "lvl-" + h.tagName[1];
        const a = document.createElement("a");
        a.href = "#" + h.id;
        a.textContent = h.textContent.replace(/\s*#\s*$/, "").trim();
        li.appendChild(a);
        list.appendChild(li);
      });
      nav.appendChild(list);
    }

    const links = headings.map((h) => nav.querySelector('a[href="#' + CSS.escape(h.id) + '"]')).filter(Boolean);
    if (links.length !== headings.length) return;

    /* Jumps glide so the eye can follow them, over a distance-scaled but bounded time; the
       browser's own smooth scrolling is inconsistent over long documents. */
    const slow = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    function glide(to) {
      const from = window.scrollY;
      const span = to - from;
      const time = Math.min(700, Math.max(220, Math.abs(span) / 4));
      if (slow || Math.abs(span) < 2) {
        window.scrollTo(0, to);
        return;
      }
      const start = performance.now();
      (function step(now) {
        const at = Math.min(1, (now - start) / time);
        const ease = at < 0.5 ? 4 * at * at * at : 1 - Math.pow(-2 * at + 2, 3) / 2;
        window.scrollTo(0, from + span * ease);
        if (at < 1) requestAnimationFrame(step);
      })(start);
    }

    /* Any link into the page glides the same way: the contents list, a heading's own anchor,
       and the cross-references in the tables. */
    function jumpTo(target) {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const top = target.getBoundingClientRect().top + window.scrollY - jumpOffset();
      glide(Math.max(0, Math.min(max, top)));
      history.replaceState(null, "", "#" + target.id);
    }
    window.jumpToAnchor = jumpTo;

    document.addEventListener("click", function (event) {
      const link = event.target.closest('a[href^="#"]');
      if (!link || event.defaultPrevented || event.metaKey || event.ctrlKey) return;
      const id = decodeURIComponent(link.getAttribute("href").slice(1));
      if (!id) return;
      const target = document.getElementById(id);
      if (!target || !main.contains(target)) return;
      event.preventDefault();
      jumpTo(target);
    });

    const box = nav.parentElement;
    const fade = window.watchScrollFade ? window.watchScrollFade(box, 19) : function () {};

    let active = null;
    function highlight() {
      let index = 0;
      for (let i = 0; i < headings.length; i++) {
        /* Measured against the same line a jump lands on, so the entry marked active is the
           heading actually readable below the fade. */
        if (headings[i].getBoundingClientRect().top - jumpOffset() <= 1) index = i;
        else break;
      }
      const link = links[index];
      if (link === active) return;
      if (active) active.classList.remove("is-active");
      link.classList.add("is-active");
      active = link;
      const bounds = box.getBoundingClientRect();
      const spot = link.getBoundingClientRect();
      if (spot.top < bounds.top || spot.bottom > bounds.bottom) {
        link.scrollIntoView({ block: "nearest" });
      }
      fade();
    }

    /* Let the last heading reach the top of the viewport, but no further. */
    function padTail() {
      main.style.paddingBottom = "0px";
      const last = headings[headings.length - 1];
      const lastTop = last.getBoundingClientRect().top + window.scrollY;
      const wanted = lastTop - jumpOffset() + window.innerHeight;
      main.style.paddingBottom =
        Math.max(0, Math.round(wanted - document.documentElement.scrollHeight)) + "px";
    }

    let queued = false;
    function onScroll() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () {
        queued = false;
        highlight();
      });
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", function () {
      padTail();
      highlight();
      fade();
    });
    window.addEventListener("load", padTail);
    padTail();
    highlight();
    fade();
  });
})();
