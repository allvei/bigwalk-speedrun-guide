(function () {
  document.addEventListener("DOMContentLoaded", function () {
    const nav = document.getElementById("toc-nav");
    const main = document.getElementById("main");
    if (!nav || !main) return;

    const headings = Array.from(main.querySelectorAll("h2[id], h3[id], h4[id]"));
    if (!headings.length) return;

    const list = document.createElement("ul");
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

    const links = new Map(headings.map((h, i) => [h.id, list.children[i].firstChild]));
    let current = null;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const link = links.get(entry.target.id);
          if (!link || link === current) return;
          if (current) current.classList.remove("is-active");
          link.classList.add("is-active");
          current = link;
        });
      },
      { rootMargin: "-88px 0px -70% 0px" }
    );
    headings.forEach((h) => observer.observe(h));
  });
})();
