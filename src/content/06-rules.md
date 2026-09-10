---
title: Rules
order: 2.5
---

## Rules

### General Rules

- All runs require game audio and footage.
- Time starts first frame when the HOST loads in. (First Black Frame after "Loading..." text)
- Time ends first frame the HOST sees "Continue" after beating the game.
- Runs must be uploaded to YouTube for retiming purposes.
- For Multiplayer: Host POV must always have recording.
- Unless stated otherwise in the category rules:
  - 1-4 Player runs require all POVs.
  - 5-8 Player runs require 4+ POVs.
  - 9-12 Player runs require 50%+ of players (rounded UP) to have POVs.
- Please provide names for all players present in multiplayer runs, even if they do not have a speedrun.com account.
- Have fun!

### Category Rules

<div class="rules-controls">
  <div class="rules-cat">
    <strong class="rules-cat-label">Game Mode:</strong>
    <div class="editor-tabs" role="tablist" aria-label="Game mode">
      <button type="button" class="tab is-active" data-player="2 Player" role="tab" aria-selected="true">2P</button>
      <button type="button" class="tab" data-player="3 Player" role="tab" aria-selected="false">3P</button>
      <button type="button" class="tab" data-player="4 Player" role="tab" aria-selected="false">4P</button>
    </div>
  </div>
  <div class="rules-cat">
    <strong class="rules-cat-label">Ending:</strong>
    <div class="editor-tabs" role="tablist" aria-label="Category ending">
      <button type="button" class="tab is-active" data-ending="big-goodbye" role="tab" aria-selected="true">Big Goodbye</button>
      <button type="button" class="tab" data-ending="big-game" role="tab" aria-selected="false">Big Game</button>
    </div>
  </div>
  <div class="rules-cat">
    <strong class="rules-cat-label">Type:</strong>
    <div class="editor-tabs" role="tablist" aria-label="Category type">
      <button type="button" class="tab is-active" data-type="unrestricted" role="tab" aria-selected="true">Unrestricted</button>
      <button type="button" class="tab" data-type="glitched" role="tab" aria-selected="false">Glitched</button>
      <button type="button" class="tab" data-type="glitchless" role="tab" aria-selected="false">Glitchless</button>
    </div>
  </div>
</div>

<div class="rules-output">
  <div class="rules-category" data-ending="big-goodbye" data-type="unrestricted">
    <p><strong>Big Goodbye · Unrestricted</strong></p>
    <ul>
      <li>Get the "Big Goodbye" ending as fast as possible by any means necessary.</li>
      <li>Only requires Host POV.</li>
    </ul>
  </div>
  <div class="rules-category" data-ending="big-goodbye" data-type="glitched" hidden>
    <p><strong>Big Goodbye · Glitched</strong></p>
    <ul>
      <li>Get the "Big Goodbye" ending as fast as possible while meeting the following conditions:
        <ul>
          <li>You must open the entrance to black tower.</li>
          <li>You must place the black key in its keyhole.</li>
          <li>You must power down both silencers.</li>
          <li>You may use any glitches.</li>
        </ul>
      </li>
      <li>Upon creation of the new game, you must select <span data-player-text>2 Player</span> mode.</li>
    </ul>
  </div>
  <div class="rules-category" data-ending="big-goodbye" data-type="glitchless" hidden>
    <p><strong>Big Goodbye · Glitchless</strong></p>
    <ul>
      <li>Get the "Big Goodbye" ending as fast as possible.</li>
      <li>No glitches may be used.</li>
      <li>Upon creation of the new game, you must select <span data-player-text>2 Player</span> mode.</li>
    </ul>
  </div>
  <div class="rules-category" data-ending="big-game" data-type="unrestricted" hidden>
    <p><strong>Big Game · Unrestricted</strong></p>
    <ul>
      <li>Get the "Big Game" ending as fast as possible by any means necessary.</li>
      <li>Only requires Host POV.</li>
    </ul>
  </div>
  <div class="rules-category" data-ending="big-game" data-type="glitched" hidden>
    <p><strong>Big Game · Glitched</strong></p>
    <ul>
      <li>Rules to be determined after some testing on our part! Please don't submit runs here until we have.</li>
      <li>Upon creation of the new game, you must select <span data-player-text>2 Player</span> mode.</li>
    </ul>
  </div>
  <div class="rules-category" data-ending="big-game" data-type="glitchless" hidden>
    <p><strong>Big Game · Glitchless</strong></p>
    <ul>
      <li>Get the "Big Game" ending as fast as possible.</li>
      <li>No glitches may be used.</li>
      <li>Upon creation of the new game, you must select <span data-player-text>2 Player</span> mode.</li>
    </ul>
  </div>
</div>

<script>
(function () {
  function tabGroup(selector, onChange) {
    const tabs = document.querySelectorAll(selector);
    if (!tabs.length) return;
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (t) {
          t.classList.remove('is-active');
          t.setAttribute('aria-selected', 'false');
        });
        tab.classList.add('is-active');
        tab.setAttribute('aria-selected', 'true');
        onChange();
      });
    });
  }

  function showCategory() {
    const endingEl = document.querySelector('[data-ending].is-active');
    const typeEl = document.querySelector('[data-type].is-active');
    const ending = endingEl ? endingEl.dataset.ending : 'big-goodbye';
    const type = typeEl ? typeEl.dataset.type : 'unrestricted';
    document.querySelectorAll('.rules-category').forEach(function (el) {
      el.hidden = el.dataset.ending !== ending || el.dataset.type !== type;
    });
    updatePlayer();
  }

  function updatePlayer() {
    const playerEl = document.querySelector('[data-player].is-active');
    const player = playerEl ? playerEl.dataset.player : '2 Player';
    document.querySelectorAll('[data-player-text]').forEach(function (el) {
      el.textContent = player;
    });
  }

  tabGroup('[data-player]', updatePlayer);
  tabGroup('[data-ending]', showCategory);
  tabGroup('[data-type]', showCategory);
  showCategory();
})();
</script>
