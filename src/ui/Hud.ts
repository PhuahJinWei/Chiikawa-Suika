import type { AbilityId } from '../config/game';
import { TIERS } from '../config/tiers';
import { ABILITY_IDS } from '../game/Abilities';
import type { Game } from '../game/Game';
import type { BallArt } from '../render/BallArt';
import { $, formatScore, h } from './dom';
import { ICONS } from './icons';

export const ABILITY_INFO: Record<AbilityId, { name: string; desc: string }> = {
  shake: { name: 'ゆらす', desc: 'はこを ゆらして、なかまを うごかすよ。' },
  remove: { name: 'けす', desc: 'すきな なかまを ひとつ けすよ。\nつかったら、けしたい なかまを タップしてね。' },
  pick: { name: 'えらぶ', desc: 'つぎに おとす なかまを えらべるよ。' },
  flip: { name: 'さかさま', desc: 'はこを さかさまに して、なかまを ならべかえるよ。' },
};

/** While けす waits for a friend to be tapped, its button cancels it. */
const CANCEL_NAME = 'やめる';

interface AbilityEls {
  btn: HTMLButtonElement;
  fill: SVGCircleElement;
  gems: HTMLElement;
  name: HTMLElement;
}

/** The in-game heads-up display: score, best, next, friends, ability buttons. */
export class Hud {
  private readonly scoreEl = $('#score');
  private readonly bestEl = $('#best');
  private readonly nextImg = $('#next-img') as HTMLImageElement;
  private readonly friendsEl = $('#friends');
  private readonly collectionEl = $('#collection');
  private readonly cabinet = $('#stage-wrap');
  private readonly abilityEls = {} as Record<AbilityId, AbilityEls>;
  private readonly abilityKeys: Partial<Record<AbilityId, string>> = {};
  private nextTier = 0;

  constructor(
    private readonly art: BallArt,
    onAbility: (id: AbilityId) => void,
  ) {
    const root = $('#abilities');
    for (const id of ABILITY_IDS) {
      const btn = h('button', {
        class: 'ability',
        type: 'button',
        onclick: (e: MouseEvent) => {
          // Don't keep focus, or Space (drop) would press this button again.
          (e.currentTarget as HTMLElement).blur();
          onAbility(id);
        },
      });
      btn.innerHTML = `
        <span class="ab-icon">
          <svg class="ab-ring" viewBox="0 0 60 60" aria-hidden="true"><circle class="track" cx="30" cy="30" r="27"/><circle class="fill" cx="30" cy="30" r="27" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100"/></svg>
          <span class="ab-blob">${ICONS[id]}</span>
          <span class="ab-gems"></span>
        </span>
        <span class="ab-name"></span>`;
      root.append(btn);
      this.abilityEls[id] = {
        btn,
        fill: btn.querySelector('.fill') as SVGCircleElement,
        gems: btn.querySelector('.ab-gems') as HTMLElement,
        name: btn.querySelector('.ab-name') as HTMLElement,
      };
    }
  }

  setScore(score: number, bump: boolean): void {
    this.scoreEl.textContent = formatScore(score);
    if (bump) {
      this.scoreEl.classList.remove('bump');
      void this.scoreEl.offsetWidth;
      this.scoreEl.classList.add('bump');
    }
  }

  setBest(best: number): void {
    this.bestEl.textContent = formatScore(best);
  }

  setNext(tier: number): void {
    this.nextTier = tier;
    this.nextImg.src = this.art.thumbnail(tier, 96);
    this.nextImg.alt = TIERS[tier].name;
    this.nextImg.classList.remove('pop');
    void this.nextImg.offsetWidth;
    this.nextImg.classList.add('pop');
  }

  /**
   * Collection of every friend; undiscovered ones are silhouettes. A chart in the side
   * panel on wide screens, and the なかま sheet (opened from the つぎ bubble) everywhere.
   */
  renderFriends(game: Game, fresh = -1): void {
    const cls = (i: number, base: string) =>
      [base, game.discovered[i] ? '' : 'unknown', i === game.bestTier ? 'best' : '', i === fresh ? 'fresh' : ''].filter(Boolean).join(' ');
    this.friendsEl.replaceChildren(
      ...TIERS.map((t, i) =>
        h('li', { class: cls(i, 'friend') }, h('img', { src: this.art.thumbnail(i, 96), alt: game.discovered[i] ? t.name : '？' })),
      ),
    );
    this.collectionEl.replaceChildren(
      ...TIERS.map((t, i) =>
        h(
          'li',
          { class: cls(i, '') },
          h('span', { class: 'pic' }, h('img', { src: this.art.thumbnail(i, 96), alt: '' })),
          h('span', { class: 'name' }, game.discovered[i] ? t.name : '？？？'),
        ),
      ),
    );
  }

  /**
   * One clear state per button: gems while charged, a grey icon with its recharge ring
   * while empty, grey while it can't be used right now, and やめる while けす is waiting.
   * Cheap to call every frame: the DOM is only touched when an ability's state changed.
   */
  renderAbilities(game: Game): void {
    for (const id of ABILITY_IDS) {
      const el = this.abilityEls[id];
      const charges = game.abilities.charges(id);
      const active = id === 'remove' && game.removeMode;
      const usable = active || game.canUse(id);
      const progress = charges === 0 ? game.abilities.progress(id) : 0;
      const key = `${usable}|${active}|${charges}|${progress}`;
      if (this.abilityKeys[id] === key) continue;
      this.abilityKeys[id] = key;
      el.btn.classList.toggle('empty', charges === 0 && !active);
      el.btn.classList.toggle('busy', charges > 0 && !usable);
      el.btn.classList.toggle('active', active);
      el.fill.setAttribute('stroke-dashoffset', String(100 - progress * 100));
      if (el.gems.childElementCount !== charges) {
        el.gems.replaceChildren(...Array.from({ length: charges }, () => h('i', { class: 'gem' })));
      }
      const name = active ? CANCEL_NAME : ABILITY_INFO[id].name;
      el.name.textContent = name;
      el.btn.setAttribute('aria-label', name);
    }
  }

  pulseAbility(id: AbilityId): void {
    const btn = this.abilityEls[id].btn;
    btn.classList.remove('ready-pulse');
    void btn.offsetWidth;
    btn.classList.add('ready-pulse');
  }

  setRemoveMode(active: boolean): void {
    this.cabinet.classList.toggle('removing', active);
  }

  /** Re-draw thumbnails after the ball pictures finished loading. */
  refreshArt(game: Game): void {
    this.setNext(this.nextTier);
    this.renderFriends(game);
  }
}
