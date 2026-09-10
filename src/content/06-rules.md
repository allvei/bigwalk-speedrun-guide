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

<div class="rules-at1">
  <strong class="rules-at1-label">Game Mode (AT1):</strong>
  <div class="editor-tabs" role="tablist" aria-label="Game mode">
    <button type="button" class="tab is-active" data-at1="2 Player" role="tab" aria-selected="true">2P</button>
    <button type="button" class="tab" data-at1="3 Player" role="tab" aria-selected="false">3P</button>
    <button type="button" class="tab" data-at1="4 Player" role="tab" aria-selected="false">4P</button>
  </div>
</div>

#### Big Goodbye Unrestricted

- Get the "Big Goodbye" ending as fast as possible by any means necessary.
- Only requires Host POV.

#### Big Goodbye Glitched

- Get the "Big Goodbye" ending as fast as possible while meeting the following conditions:
  - You must open the entrance to black tower.
  - You must place the black key in its keyhole.
  - You must power down both silencers.
  - You may use any glitches.
- Upon creation of the new game, you must select <span data-at1-player>2 Player</span> mode.

#### Big Goodbye Glitchless

- Get the "Big Goodbye" ending as fast as possible.
- No glitches may be used.
- Upon creation of the new game, you must select <span data-at1-player>2 Player</span> mode.

#### Big Game Unrestricted

- Get the "Big Game" ending as fast as possible by any means necessary.
- Only requires Host POV.

#### Big Game Glitched

- Rules to be determined after some testing on our part! Please don't submit runs here until we have.
- Upon creation of the new game, you must select <span data-at1-player>2 Player</span> mode.

#### Big Game Glitchless

- Get the "Big Game" ending as fast as possible.
- No glitches may be used.
- Upon creation of the new game, you must select <span data-at1-player>2 Player</span> mode.

<script>
(function () {
  const tabs = document.querySelectorAll('[data-at1]');
  if (!tabs.length) return;
  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      tabs.forEach(function (t) {
        t.classList.remove('is-active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('is-active');
      tab.setAttribute('aria-selected', 'true');
      document.querySelectorAll('[data-at1-player]').forEach(function (el) {
        el.textContent = tab.dataset.at1;
      });
    });
  });
})();
</script>
