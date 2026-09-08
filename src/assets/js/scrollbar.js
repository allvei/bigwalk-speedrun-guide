/* The page's scrollbar, drawn by us: a native one runs the full height of the window and
   crosses the sticky header and footer, and reserving its width shifts the page whenever the
   modal locks scrolling. */
(function () {
  const GAP = 8;
  const MIN_THUMB = 40;

  /* Any scrolling box fades out where its content continues past an edge. */
  window.watchScrollFade = function (el) {
    el.classList.add("scroll-fade");
    function fade() {
      el.classList.toggle("has-more", el.scrollTop + el.clientHeight < el.scrollHeight - 2);
      el.classList.toggle("has-above", el.scrollTop > 2);
    }
    el.addEventListener("scroll", fade, { passive: true });
    window.addEventListener("resize", fade);
    if (window.ResizeObserver) new ResizeObserver(fade).observe(el);
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

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("load", schedule);
    if (window.ResizeObserver) new ResizeObserver(schedule).observe(document.body);
    place();
  });
})();
