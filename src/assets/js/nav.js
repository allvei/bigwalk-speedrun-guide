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
    const backdrop = document.getElementById("drawer-backdrop");
    if (!header || !links || !toc || !navBtn || !tocBtn || !backdrop) return;

    /* The panels hang off the header, whose height depends on how the title wraps. */
    function measure() {
      document.documentElement.style.setProperty("--header-h", header.offsetHeight + "px");
    }
    measure();
    window.addEventListener("resize", measure);

    const phone = window.matchMedia("(max-width: 900px)");
    let faded = false;

    /* Becoming a drawer gives a panel an off-screen transform it did not have a moment ago,
       which the browser plays as a panel sliding shut. Transitions are switched off around
       the crossing, and until the first paint has settled. */
    function settle() {
      document.body.classList.add("drawers-settling");
      window.setTimeout(() => document.body.classList.remove("drawers-settling"), 120);
    }
    document.body.classList.add("drawers-settling");
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => document.body.classList.remove("drawers-settling"))
    );
    if (phone.addEventListener) phone.addEventListener("change", settle);
    window.matchMedia("(max-width: 700px)").addEventListener("change", settle);

    /* On a phone the toggle buttons have no label, so their title is the only hint — but the
       native tooltip that fires on tap is not wanted, and the drawers carry their own titles.
       The title is parked on the element (kept for desktop, where tooltips.js draws its own)
       and restored when the layout crosses back. */
    function parkTitles(on) {
      [navBtn, tocBtn].forEach((btn) => {
        if (on && btn.hasAttribute("title")) {
          btn.dataset.tip = btn.getAttribute("title");
          btn.removeAttribute("title");
        } else if (!on && btn.dataset.tip) {
          btn.setAttribute("title", btn.dataset.tip);
          delete btn.dataset.tip;
        }
      });
    }
    parkTitles(phone.matches);
    if (phone.addEventListener) phone.addEventListener("change", (e) => parkTitles(e.matches));

    function show(panel, button, open) {
      panel.classList.toggle("is-open", open);
      button.setAttribute("aria-expanded", String(open));
      if (panel === links) document.body.classList.toggle("nav-drawer-open", open);
      /* As a drawer the menu can outrun the screen, so it gets the same fades and overlay bar
         as the other scrolling boxes, but only once it is one. */
      if (open && !faded && phone.matches && window.watchScrollFade) {
        faded = true;
        window.watchScrollFade(links, 31);
      }
    }

    /* Hidden is dropped a frame before the class so the dimming actually transitions. */
    function dim(open) {
      if (open) {
        backdrop.hidden = false;
        requestAnimationFrame(() => backdrop.classList.add("is-open"));
      } else {
        backdrop.classList.remove("is-open");
        window.setTimeout(() => {
          if (!backdrop.classList.contains("is-open")) backdrop.hidden = true;
        }, 200);
      }
      document.body.style.overflow = open ? "hidden" : "";
    }

    function closeAll() {
      show(links, navBtn, false);
      show(toc, tocBtn, false);
      dim(false);
    }

    function open(panel, button) {
      const next = !panel.classList.contains("is-open");
      closeAll();
      show(panel, button, next);
      dim(next);
    }

    navBtn.addEventListener("click", function (event) {
      event.stopPropagation();
      open(links, navBtn);
    });

    tocBtn.addEventListener("click", function (event) {
      event.stopPropagation();
      open(toc, tocBtn);
    });

    backdrop.addEventListener("click", closeAll);

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
