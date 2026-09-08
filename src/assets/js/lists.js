/* A nested list only needs a closing gap when the list it belongs to keeps going after it:
   the next item sits a level up, so the gap marks the step out. A nested list at the end of its
   parent's last item has nothing after it to step up to, so it closes tight. */
(function () {
  function mark(root) {
    root.querySelectorAll("li > ul, li > ol").forEach((nested) => {
      const parentLi = nested.parentElement;
      if (parentLi && parentLi.nextElementSibling) nested.classList.add("is-step-out");
    });
  }

  function setup() {
    const main = document.getElementById("main");
    if (main) mark(main);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setup);
  } else {
    setup();
  }

  /* The preview is rebuilt on every tab switch, so it is remarked whenever it changes. */
  window.markListStepOut = mark;
})();
