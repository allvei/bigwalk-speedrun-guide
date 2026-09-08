/* Phone menus: the header controls and the contents list each fold into a button, so the
   article is the first thing on the screen. */
(function () {
  /* A tap is often shorter than :active is visible, so the flash is its own short animation. */
  document.addEventListener(
    "pointerup",
    function (event) {
      const button = event.target.closest(
        "button, .icon-btn, .tab, .btn, .select-list li"
      );
      if (!button) return;
      button.classList.remove("is-flash");
      void button.offsetWidth;
      button.classList.add("is-flash");
      window.setTimeout(() => button.classList.remove("is-flash"), 320);
    },
    true
  );

  document.addEventListener("DOMContentLoaded", function () {
    const header = document.querySelector(".site-header");
    const links = document.querySelector(".header-links");
    const toc = document.querySelector(".toc");
    const navBtn = document.getElementById("nav-toggle");
    const tocBtn = document.getElementById("toc-toggle");
    if (!header || !links || !toc || !navBtn || !tocBtn) return;

    /* The panels hang off the header, whose height depends on how the title wraps. */
    function measure() {
      document.documentElement.style.setProperty("--header-h", header.offsetHeight + "px");
    }
    measure();
    window.addEventListener("resize", measure);

    function show(panel, button, open) {
      panel.classList.toggle("is-open", open);
      button.setAttribute("aria-expanded", String(open));
    }

    function closeAll() {
      show(links, navBtn, false);
      show(toc, tocBtn, false);
    }

    navBtn.addEventListener("click", function (event) {
      event.stopPropagation();
      const open = !links.classList.contains("is-open");
      closeAll();
      show(links, navBtn, open);
    });

    tocBtn.addEventListener("click", function (event) {
      event.stopPropagation();
      const open = !toc.classList.contains("is-open");
      closeAll();
      show(toc, tocBtn, open);
    });

    toc.addEventListener("click", function (event) {
      if (event.target.closest("a")) closeAll();
    });
    links.addEventListener("click", closeAll);
    document.addEventListener("click", function (event) {
      if (!header.contains(event.target) && !toc.contains(event.target)) closeAll();
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeAll();
    });
  });
})();
