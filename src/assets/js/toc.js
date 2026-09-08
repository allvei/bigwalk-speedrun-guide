(function () {
  const HEADER_OFFSET = 96;

  document.addEventListener("DOMContentLoaded", function () {
    const nav = document.getElementById("toc-nav");
    const main = document.getElementById("main");
    if (!nav || !main) return;

    const headings = Array.from(main.querySelectorAll("h2[id], h3[id], h4[id]"));
    if (!headings.length) return;

    const list = document.createElement("ul");
    const links = headings.map((h) => {
      const li = document.createElement("li");
      li.className = "lvl-" + h.tagName[1];
      const a = document.createElement("a");
      a.href = "#" + h.id;
      a.textContent = h.textContent.replace(/\s*#\s*$/, "").trim();
      /* Nearby jumps glide so the eye can follow them; far ones would take too long. */
      a.addEventListener("click", function (event) {
        event.preventDefault();
        const top = h.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET;
        const near = Math.abs(top - window.scrollY) < window.innerHeight * 2;
        window.scrollTo({ top, behavior: near ? "smooth" : "auto" });
        history.replaceState(null, "", "#" + h.id);
      });
      li.appendChild(a);
      list.appendChild(li);
      return a;
    });
    nav.appendChild(list);

    let active = null;
    function highlight() {
      let index = 0;
      for (let i = 0; i < headings.length; i++) {
        if (headings[i].getBoundingClientRect().top - HEADER_OFFSET <= 1) index = i;
        else break;
      }
      const link = links[index];
      if (link === active) return;
      if (active) active.classList.remove("is-active");
      link.classList.add("is-active");
      active = link;
      const box = nav.parentElement.getBoundingClientRect();
      const spot = link.getBoundingClientRect();
      if (spot.top < box.top || spot.bottom > box.bottom) {
        link.scrollIntoView({ block: "nearest" });
      }
    }

    /* Let the last heading reach the top of the viewport, but no further. */
    function padTail() {
      main.style.paddingBottom = "0px";
      const last = headings[headings.length - 1];
      const lastTop = last.getBoundingClientRect().top + window.scrollY;
      const wanted = lastTop - HEADER_OFFSET + window.innerHeight;
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
    });
    window.addEventListener("load", padTail);
    padTail();
    highlight();
  });
})();
