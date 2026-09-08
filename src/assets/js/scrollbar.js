/* The page's scrollbar, drawn by us: a native one runs the full height of the window and
   crosses the sticky header and footer, and reserving its width shifts the page whenever the
   modal locks scrolling. */
(function () {
  const GAP = 8;
  const MIN_THUMB = 40;

  /* Any scrolling box fades out where its content continues past an edge. The gradients are
     sticky children rather than a mask on the box itself, which would fade its scrollbar with
     the content. */
  window.watchScrollFade = function (el) {
    el.classList.add("scroll-fade");
    const top = document.createElement("div");
    top.className = "fade-edge at-top";
    const bottom = document.createElement("div");
    bottom.className = "fade-edge at-bottom";

    function fade() {
      /* Boxes whose content is replaced wholesale, like a thread, lose the edges or leave them
         stranded mid-list, so they are put back at the rim on every pass. */
      if (el.firstChild !== top) el.insertBefore(top, el.firstChild);
      if (el.lastChild !== bottom) el.appendChild(bottom);
      el.classList.toggle("has-more", el.scrollTop + el.clientHeight < el.scrollHeight - 2);
      el.classList.toggle("has-above", el.scrollTop > 2);
    }
    el.addEventListener("scroll", fade, { passive: true });
    window.addEventListener("resize", fade);
    if (window.ResizeObserver) new ResizeObserver(fade).observe(el);
    if (window.MutationObserver) new MutationObserver(fade).observe(el, { childList: true });
    fade();
    return fade;
  };

  document.addEventListener("DOMContentLoaded", function () {
    const bar = document.createElement("div");
    bar.className = "page-scrollbar";
    bar.hidden = true;
    const thumb = document.createElement("div");
    thumb.className = "page-scrollbar-thumb";
    bar.appendChild(thumb);
    document.body.appendChild(bar);

    const header = document.querySelector(".site-header");
    const footer = document.querySelector(".site-footer");
    let track = 0;
    let size = 0;

    function measure() {
      const view = window.innerHeight;
      const total = document.documentElement.scrollHeight;
      const top = (header ? header.offsetHeight : 0) + GAP;
      const bottom = (footer ? footer.offsetHeight : 0) + GAP;
      track = view - top - bottom;
      if (total <= view + 1 || track < MIN_THUMB) {
        bar.hidden = true;
        return false;
      }
      bar.hidden = false;
      bar.style.top = top + "px";
      bar.style.height = track + "px";
      size = Math.max(MIN_THUMB, Math.round((track * view) / total));
      thumb.style.height = size + "px";
      return true;
    }

    function place() {
      if (!measure()) return;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const y = max > 0 ? (window.scrollY / max) * (track - size) : 0;
      thumb.style.transform = "translateY(" + y + "px)";
    }

    let queued = false;
    function schedule() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () {
        queued = false;
        place();
      });
    }

    /* Dragging the thumb maps its travel back onto the document's. */
    let from = 0;
    let fromScroll = 0;
    function onMove(event) {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const travel = track - size;
      if (travel <= 0) return;
      window.scrollTo(0, fromScroll + ((event.clientY - from) / travel) * max);
    }
    function onUp() {
      bar.classList.remove("is-dragging");
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    }
    thumb.addEventListener("pointerdown", function (event) {
      event.preventDefault();
      from = event.clientY;
      fromScroll = window.scrollY;
      bar.classList.add("is-dragging");
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    });

    /* Clicking the empty part of the bar jumps a page towards the click. */
    bar.addEventListener("pointerdown", function (event) {
      if (event.target === thumb) return;
      const spot = event.clientY - bar.getBoundingClientRect().top;
      const above = spot < thumb.getBoundingClientRect().top - bar.getBoundingClientRect().top;
      window.scrollBy({ top: above ? -window.innerHeight : window.innerHeight, behavior: "smooth" });
    });

    /* The article scrolls with the window, so its fades sit between the sticky header and
       footer instead of inside a box. */
    const fades = ["at-top", "at-bottom"].map(function (where) {
      const edge = document.createElement("div");
      edge.className = "page-fade " + where;
      document.body.appendChild(edge);
      return edge;
    });

    function pageFades() {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      /* Measured off the bars themselves and pulled a couple of pixels under them: rounded
         heights otherwise leave a hairline of unfaded text above the gradient. */
      const top = header ? header.getBoundingClientRect().bottom : 0;
      const bottom = footer ? window.innerHeight - footer.getBoundingClientRect().top : 0;
      fades[0].style.top = Math.max(0, Math.floor(top) - 2) + "px";
      fades[1].style.bottom = Math.max(0, Math.floor(bottom) - 2) + "px";
      fades[0].classList.toggle("is-on", window.scrollY > 2);
      fades[1].classList.toggle("is-on", max > 2 && window.scrollY < max - 2);
    }

    window.addEventListener("scroll", pageFades, { passive: true });
    window.addEventListener("resize", pageFades);
    window.addEventListener("load", pageFades);
    pageFades();

    /* The bar lights up while the page moves, as though the pointer were on it. */
    let resting = 0;
    function woke() {
      bar.classList.add("is-scrolling");
      window.clearTimeout(resting);
      resting = window.setTimeout(() => bar.classList.remove("is-scrolling"), 700);
    }

    window.addEventListener("scroll", woke, { passive: true });
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("load", schedule);
    if (window.ResizeObserver) new ResizeObserver(schedule).observe(document.body);
    place();
  });
})();
