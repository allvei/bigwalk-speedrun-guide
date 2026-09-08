/* Tooltips in the site's own style, under the control they describe. The platform's own are
   drawn at the pointer after a delay of its choosing, in a colour scheme of its own, so the
   title is taken off the element while it is hovered and put back afterwards. */
(function () {
  if (!window.matchMedia("(hover: hover)").matches) return;

  const DELAY = 220;
  const GAP = 8;

  const tip = document.createElement("div");
  tip.className = "tooltip";
  tip.setAttribute("role", "tooltip");
  tip.hidden = true;
  let shown = null;
  let timer = 0;

  document.addEventListener("DOMContentLoaded", () => { if (!tip.parentNode) document.body.appendChild(tip); });
  if (document.body) document.body.appendChild(tip);

  function place(el) {
    const spot = el.getBoundingClientRect();
    const box = tip.getBoundingClientRect();
    let left = spot.left + spot.width / 2 - box.width / 2;
    left = Math.max(8, Math.min(window.innerWidth - box.width - 8, left));
    let top = spot.bottom + GAP;
    /* Below the control, unless there is no room left below it. */
    if (top + box.height > window.innerHeight - 8) top = spot.top - box.height - GAP;
    tip.style.left = Math.round(left) + "px";
    tip.style.top = Math.round(top) + "px";
  }

  function open(el) {
    const text = el.getAttribute("title") || el.dataset.tip;
    if (!text) return;
    /* Parked on the element so the browser has nothing left to draw itself. */
    if (el.hasAttribute("title")) {
      el.dataset.tip = text;
      el.removeAttribute("title");
    }
    shown = el;
    tip.textContent = text;
    tip.hidden = false;
    place(el);
    requestAnimationFrame(() => tip.classList.add("is-on"));
  }

  function close() {
    window.clearTimeout(timer);
    if (!shown) return;
    shown = null;
    tip.classList.remove("is-on");
    window.setTimeout(() => {
      if (!shown) tip.hidden = true;
    }, 140);
  }

  /* The title is restored the moment the tooltip is not ours to draw, so assistive tools and
     a page saved to disk still carry it. */
  function restore(el) {
    if (el && el.dataset.tip && !el.hasAttribute("title")) {
      el.setAttribute("title", el.dataset.tip);
      delete el.dataset.tip;
    }
  }

  function candidate(target) {
    if (!target || !target.closest) return null;
    const el = target.closest("[title], [data-tip]");
    if (!el || el.closest(".tooltip")) return null;
    return el;
  }

  document.addEventListener("pointerover", function (event) {
    const el = candidate(event.target);
    if (!el || el === shown) return;
    close();
    window.clearTimeout(timer);
    timer = window.setTimeout(() => open(el), DELAY);
  });

  document.addEventListener("pointerout", function (event) {
    const el = candidate(event.target);
    if (!el) return;
    if (event.relatedTarget && el.contains(event.relatedTarget)) return;
    window.clearTimeout(timer);
    if (el === shown) close();
    restore(el);
  });

  /* A tooltip that outlives its control, a click, or a scroll is just litter. */
  document.addEventListener("pointerdown", function () {
    if (shown) restore(shown);
    close();
  });
  window.addEventListener("scroll", close, { passive: true });
  window.addEventListener("blur", close);

  document.addEventListener("focusin", function (event) {
    const el = candidate(event.target);
    if (el) open(el);
  });
  document.addEventListener("focusout", function (event) {
    const el = candidate(event.target);
    if (el === shown) {
      close();
      restore(el);
    }
  });
})();
