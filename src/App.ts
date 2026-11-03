import { Music } from './audio/Music';
import { Sfx } from './audio/Sfx';
import { GAME, STAGE, type AbilityId } from './config/game';
import { MAX_TIER, TIERS } from './config/tiers';
import { ABILITY_IDS } from './game/Abilities';
import { Game } from './game/Game';
import type { GameSummary } from './game/types';
import { Input } from './input/Input';
import { BallArt } from './render/BallArt';
import { Renderer } from './render/Renderer';
import { GameSave } from './services/GameSave';
import { HighScore } from './services/HighScore';
import { SettingsStore } from './services/Settings';
import { browserStore } from './services/storage';
import { $, formatScore, h } from './ui/dom';
import { ABILITY_INFO, Hud } from './ui/Hud';
import { ICONS, UI_ICONS } from './ui/icons';

type Screen = 'title' | 'howto' | 'friends' | 'settings' | 'pause' | 'over' | 'ability' | 'confirm';
type Mode = 'title' | 'playing' | 'over';

const SCREEN_IDS: Record<Screen, string> = {
  title: 'screen-title',
  howto: 'screen-howto',
  friends: 'screen-friends',
  settings: 'screen-settings',
  pause: 'screen-pause',
  over: 'screen-over',
  ability: 'screen-ability',
  confirm: 'screen-confirm',
};

/** The round buttons under つづける in the pause menu. */
const PAUSE_ITEMS = [
  { action: 'ask-restart', label: 'やりなおす', icon: UI_ICONS.retry },
  { action: 'howto', label: 'あそびかた', icon: UI_ICONS.help },
  { action: 'settings', label: 'せってい', icon: UI_ICONS.gear },
  { action: 'ask-title', label: 'タイトル', icon: UI_ICONS.home },
];

/** The round buttons under あそぶ on the title screen. */
const TITLE_ITEMS = [
  { action: 'howto', label: 'あそびかた', icon: UI_ICONS.help },
  { action: 'settings', label: 'せってい', icon: UI_ICONS.gear },
];

/**
 * The title screen's pile of friends, on a 300 x 150 grid (x right, y up from the ground,
 * d = diameter). Placed so neighbours just touch, like a pile in the box: ひとは in the
 * middle, うさぎ and ハチワレ beside it, ちいかわ and モモンガ resting in the dips.
 */
const HERO = [
  { tier: 9, x: 150, y: 64, d: 128 },
  { tier: 3, x: 55.3, y: 35, d: 70 },
  { tier: 2, x: 239.1, y: 31, d: 62 },
  { tier: 1, x: 64.9, y: 96.3, d: 54 },
  { tier: 4, x: 247, y: 101.6, d: 80 },
];

/** Set once the player has seen あそびかた, so it opens by itself only before the first game. */
const SEEN_HOWTO_KEY = 'mochi-pon.seen-howto.v1';
/** A moment (ms) to see the final pile before the おしまい panel slides up. */
const GAME_OVER_PAUSE = 1500;
/** How often (ms) a game in progress is saved while playing. */
const SAVE_EVERY = 2000;

const clampTier = (t: number) => Math.max(0, Math.min(MAX_TIER, Math.round(t) || 0));

/** Wires the game, renderer, input, HUD, menus, sound and storage together. */
export class App {
  readonly game = new Game();
  private readonly art = new BallArt();
  private readonly sfx = new Sfx();
  private readonly music = new Music(this.sfx);
  private readonly highScore = new HighScore();
  private readonly settings = new SettingsStore();
  private readonly saves = new GameSave();
  private readonly canvas = $('#stage') as HTMLCanvasElement;
  private readonly renderer = new Renderer(this.canvas, this.art);
  private readonly hud: Hud;
  private readonly input: Input;

  private mode: Mode = 'title';
  private screen: Screen | null = 'title';
  private backStack: Screen[] = [];
  private pointer: { x: number; y: number } | null = null;
  private lastFrame = 0;
  private dangerTick = -1;
  private dialogAbility: AbilityId | null = null;
  private confirmAction: (() => void) | null = null;
  private howtoPage = 0;
  private lastSave = 0;

  constructor() {
    this.hud = new Hud(this.art, (id) => this.openAbility(id));
    this.input = new Input(this.canvas, {
      gesture: () => this.sfx.unlock(),
      aimAt: (px, py) => this.onAim(px, py),
      hover: (px, py) => (this.pointer = this.renderer.toLocal(px, py)),
      leave: () => (this.pointer = null),
      release: (px, py) => this.onRelease(px, py),
      drop: () => this.playing && !this.game.removeMode && this.game.drop(),
      ability: (id) => this.openAbility(id),
      pauseOrBack: () => this.onEscape(),
    });
  }

  async start(): Promise<void> {
    this.setupStatic();
    this.bindGameEvents();
    this.bindMenus();
    this.bindHowto();
    this.bindSettings();
    this.applySettings();
    this.music.start();

    const canvas = this.canvas;
    const fit = () => this.renderer.resize(canvas.clientWidth, canvas.clientHeight);
    fit(); // size it now: the first frame must not draw into an unmeasured canvas
    new ResizeObserver(fit).observe(canvas);
    // Leaving the page (switching apps, closing the tab) saves the game and pauses it.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.saveGame();
        if (this.playing) this.pause();
      }
      this.sfx.setBackground(document.hidden);
    });
    window.addEventListener('pagehide', () => this.saveGame());

    this.game.reset();
    this.refreshHud();
    this.renderPictures();
    this.refreshTitle();
    requestAnimationFrame(this.frame);

    await this.art.load();
    this.renderPictures();
    this.hud.refreshArt(this.game);
  }

  private get playing(): boolean {
    return this.mode === 'playing' && this.screen === null;
  }

  // ------------------------------------------------------------------ main loop

  private frame = (now: number): void => {
    // Book the next frame first, so one bad frame can never stop the game for good.
    requestAnimationFrame(this.frame);
    const dt = this.lastFrame ? Math.min(0.1, (now - this.lastFrame) / 1000) : 0;
    this.lastFrame = now;
    if (this.playing) {
      if (this.input.keyDir !== 0 && !this.game.removeMode) {
        this.game.setAim(this.game.aimX + this.input.keyDir * GAME.drop.keyboardSpeed * dt);
      }
      this.game.update(dt);
      this.tickDanger();
      this.hud.renderAbilities(this.game);
      if (now - this.lastSave > SAVE_EVERY) {
        this.lastSave = now;
        this.saveGame();
      }
    }
    this.renderer.render(this.game, this.settings.value, this.playing || this.mode === 'over' ? dt : 0, this.pointer);
  };

  private tickDanger(): void {
    const t = this.game.overflowTimer;
    const tick = t > 0 ? Math.floor(t * 2) : -1;
    if (tick !== this.dangerTick && tick >= 0) this.sfx.danger();
    this.dangerTick = tick;
  }

  // ------------------------------------------------------------------ input

  private onAim(px: number, py: number): void {
    this.pointer = this.renderer.toLocal(px, py);
    if (this.playing && !this.game.removeMode) this.game.setAim(this.pointer.x);
  }

  private onRelease(px: number, py: number): void {
    if (!this.playing) return;
    const p = this.renderer.toLocal(px, py);
    if (this.game.removeMode) {
      this.game.removeAt(p.x, p.y);
      return;
    }
    this.game.setAim(p.x);
    this.game.drop();
  }

  private onEscape(): void {
    if (this.screen === 'pause') this.resume();
    else if (this.screen !== null && this.screen !== 'title' && this.screen !== 'over') this.back();
    else if (this.playing) {
      if (this.game.removeMode) this.game.setRemoveMode(false);
      else this.pause();
    }
  }

  // ------------------------------------------------------------------ flow

  /** あそぶ / はじめから: a new game, with あそびかた first the very first time. */
  private play(): void {
    this.newGame();
    if (browserStore.get(SEEN_HOWTO_KEY) === null) this.openHowto();
  }

  private newGame(): void {
    this.saves.clear();
    this.mode = 'playing';
    this.dangerTick = -1;
    this.game.reset();
    this.refreshHud();
    this.closeToGame();
  }

  /** つづきから: pick up the saved game exactly where it was left. */
  private continueGame(): void {
    const saved = this.saves.load();
    this.mode = 'playing';
    this.dangerTick = -1;
    if (!saved || !this.game.restore(saved)) this.saves.clear();
    this.refreshHud();
    this.closeToGame();
  }

  /** Keep the game in progress on this device (no-op outside a game, or mid-shake/flip). */
  private saveGame(): void {
    if (this.mode !== 'playing') return;
    const snapshot = this.game.snapshot();
    if (snapshot) this.saves.save(snapshot);
  }

  private pause(): void {
    if (this.mode !== 'playing') return;
    this.saveGame();
    this.game.setRemoveMode(false);
    this.backStack = [];
    this.show('pause');
  }

  private resume(): void {
    this.closeToGame();
  }

  private closeToGame(): void {
    this.backStack = [];
    this.lastFrame = 0;
    this.show(null);
  }

  /** Back to the title. A game in progress stays saved, to continue later. */
  private toTitle(): void {
    this.saveGame();
    this.mode = 'title';
    this.backStack = [];
    this.game.reset();
    this.refreshHud();
    this.renderPictures();
    this.refreshTitle();
    this.show('title');
  }

  private open(screen: Screen): void {
    if (this.screen) this.backStack.push(this.screen);
    this.show(screen);
  }

  private back(): void {
    const prev = this.backStack.pop() ?? (this.mode === 'title' ? 'title' : this.mode === 'over' ? 'over' : null);
    if (prev === null) this.closeToGame();
    else this.show(prev);
  }

  private show(screen: Screen | null): void {
    this.screen = screen;
    for (const [name, id] of Object.entries(SCREEN_IDS)) {
      // While on the title, it stays underneath any menu opened from it.
      const open = name === screen || (name === 'title' && this.mode === 'title' && screen !== null);
      document.getElementById(id)?.classList.toggle('open', open);
    }
    if (screen) {
      const panel = document.getElementById(SCREEN_IDS[screen]);
      const target =
        panel?.querySelector<HTMLElement>('[data-autofocus]:not([hidden]):not(:disabled)') ??
        panel?.querySelector<HTMLElement>('.btn-big:not([hidden]), .close-btn, .btn:not([hidden])');
      target?.focus({ preventScroll: true });
    } else {
      this.canvas.focus({ preventScroll: true });
    }
  }

  /** Ask before doing something that can't be undone. */
  private ask(text: string, okLabel: string, action: () => void): void {
    $('#confirm-text').textContent = text;
    $('#confirm-ok').textContent = okLabel;
    this.confirmAction = action;
    this.open('confirm');
  }

  // ------------------------------------------------------------------ abilities

  /** Abilities never fire straight away: a dialog explains them and asks first. */
  private openAbility(id: AbilityId): void {
    if (!this.playing) return;
    if (id === 'remove' && this.game.removeMode) {
      this.game.setRemoveMode(false);
      return;
    }
    this.dialogAbility = id;
    const info = ABILITY_INFO[id];
    const abilities = this.game.abilities;
    const charges = abilities.charges(id);
    const max = abilities.max(id);
    const usable = this.game.canUse(id);

    $('#ability-title').textContent = info.name;
    $('#ability-icon').innerHTML = ICONS[id];
    $('#ability-desc').replaceChildren(...info.desc.split('\n').map((sentence) => h('span', {}, sentence)));
    $('#ability-gems').replaceChildren(...Array.from({ length: max }, (_, i) => h('i', { class: i < charges ? 'gem' : 'gem off' })));
    const meter = $('#ability-meter');
    meter.parentElement!.hidden = charges >= max;
    meter.style.width = `${Math.round(abilities.progress(id) * 100)}%`;

    const useBtn = $('#ability-use') as HTMLButtonElement;
    const picker = $('#picker');
    if (id === 'pick') {
      const options = this.game.pickOptions();
      useBtn.hidden = true;
      picker.hidden = false;
      picker.style.setProperty('--n', String(options.length));
      picker.replaceChildren(
        ...options.map((tier, i) =>
          h(
            'button',
            {
              class: tier === this.game.held ? 'pick-option current' : 'pick-option',
              type: 'button',
              disabled: !usable,
              'aria-label': TIERS[tier].name,
              'data-autofocus': i === 0,
              onclick: () => {
                this.closeToGame();
                this.game.pick(tier);
              },
            },
            h('img', { src: this.art.thumbnail(tier, 96), alt: '' }),
          ),
        ),
      );
    } else {
      useBtn.hidden = false;
      useBtn.disabled = !usable;
      picker.hidden = true;
      picker.replaceChildren();
    }
    this.sfx.click();
    this.backStack = [];
    this.show('ability');
  }

  private useDialogAbility(): void {
    const id = this.dialogAbility;
    if (!id || !this.game.canUse(id)) return;
    this.closeToGame();
    this.game.useAbility(id);
  }

  // ------------------------------------------------------------------ game over

  private onGameOver(summary: GameSummary): void {
    this.mode = 'over';
    this.saves.clear();
    this.sfx.gameOver();
    const newBest = this.highScore.record(summary.score);
    setTimeout(() => {
      $('#over-score').textContent = formatScore(summary.score);
      // The best score to beat, or a badge when this game was the new best.
      $('#over-best-value').textContent = formatScore(this.highScore.best);
      $('#over-best').hidden = newBest;
      $('#over-newbest').hidden = !newBest;
      const tier = clampTier(summary.bestTier);
      const img = $('#over-friend') as HTMLImageElement;
      img.src = this.art.thumbnail(tier, 144);
      img.alt = TIERS[tier].name;
      $('#over-name').textContent = TIERS[tier].name;
      if (newBest) this.sfx.newBest();
      this.hud.setBest(this.highScore.best);
      this.backStack = [];
      this.show('over');
    }, GAME_OVER_PAUSE);
  }

  // ------------------------------------------------------------------ game events → UI

  private bindGameEvents(): void {
    const ev = this.game.events;
    const fx = this.renderer.effects;
    const toStage = (x: number, y: number) => [x + STAGE.boxX, y + STAGE.boxY] as const;

    ev.on('reset', () => fx.clear());
    ev.on('next', ({ tier }) => this.hud.setNext(tier));
    ev.on('drop', () => this.sfx.drop());
    ev.on('score', ({ score, added }) => {
      this.hud.setScore(score, added > 0);
      if (score > this.highScore.best) this.hud.setBest(score);
    });
    ev.on('merge', ({ tier, x, y, points, chain }) => {
      const t = TIERS[tier];
      fx.burst(x, y, t.radius, [t.accent, '#ffffff', t.look.color], 8 + tier * 2);
      fx.ring(x, y, t.radius, t.accent);
      const [sx, sy] = toStage(x, y - t.radius * 0.4);
      fx.popup(sx, sy, `+${points}`, t.accent, 26 + Math.min(tier, 8) * 2.5);
      this.sfx.merge(tier, chain);
      if (tier >= 6 && !this.settings.value.reduceMotion) navigator.vibrate?.(20);
    });
    ev.on('vanish', ({ tier, x, y, points }) => {
      const t = TIERS[tier];
      fx.burst(x, y, t.radius, [t.accent, '#ffd66b', '#ffffff', '#ffc2cc', '#cfe6fb'], 60);
      fx.ring(x, y, t.radius * 1.4, '#ffd66b');
      fx.flash();
      const [sx, sy] = toStage(x, y);
      fx.popup(sx, sy, `+${points}`, '#ffd66b', 56);
      this.sfx.vanish();
      if (!this.settings.value.reduceMotion) navigator.vibrate?.([30, 40, 30]);
    });
    ev.on('discover', ({ tier }) => {
      this.hud.renderFriends(this.game, tier);
      if (tier > GAME.spawn.maxTier) this.sfx.fanfare();
    });
    ev.on('unlock', () => this.hud.renderFriends(this.game));
    ev.on('abilities', () => this.hud.renderAbilities(this.game));
    ev.on('abilityReady', ({ id }) => {
      this.hud.pulseAbility(id);
      this.sfx.ready();
    });
    ev.on('abilityUsed', ({ id }) => {
      if (id === 'shake') this.sfx.shake();
      else if (id === 'flip') this.sfx.flip();
      else if (id === 'pick') this.sfx.pick();
      this.hud.renderAbilities(this.game);
    });
    ev.on('removeMode', ({ active }) => {
      this.hud.setRemoveMode(active);
      this.hud.renderAbilities(this.game);
    });
    ev.on('removed', ({ tier, x, y }) => {
      const t = TIERS[tier];
      fx.burst(x, y, t.radius, ['#ffffff', t.accent, '#e9ddd2'], 18);
      this.sfx.remove();
    });
    ev.on('flipDone', () => this.hud.renderAbilities(this.game));
    ev.on('gameOver', (summary) => this.onGameOver(summary));
  }

  private refreshHud(): void {
    this.hud.setScore(this.game.score, false);
    this.hud.setBest(this.highScore.best);
    this.hud.setNext(this.game.spawner.next);
    this.hud.renderFriends(this.game);
    this.hud.renderAbilities(this.game);
    this.hud.setRemoveMode(false);
  }

  // ------------------------------------------------------------------ static content & menus

  private setupStatic(): void {
    document.title = GAME.title;
    $('#logo').replaceChildren(...[...GAME.title].map((ch, i) => h('span', { class: `c${(i % 4) + 1}` }, ch)));
    const iconButton = ({ action, label, icon }: { action: string; label: string; icon: string }) =>
      h('button', { class: 'icon-btn', type: 'button', 'data-action': action, html: `<span class="blob">${icon}</span><span>${label}</span>` });
    $('#pause-icons').replaceChildren(...PAUSE_ITEMS.map(iconButton));
    $('#title-icons').replaceChildren(...TITLE_ITEMS.map(iconButton));
    // Now and then one of the title friends gets a fright.
    setInterval(() => {
      if (this.screen !== 'title' || document.hidden || this.settings.value.reduceMotion) return;
      const friends = document.querySelectorAll<HTMLImageElement>('.hero-friend');
      const pick = friends[Math.floor(Math.random() * friends.length)];
      if (pick) this.surprise(pick, false);
    }, 3200);
  }

  /** Everything that shows ball pictures outside the game (re-run after the art loads). */
  private renderPictures(): void {
    $('#hero').querySelectorAll('.hero-friend').forEach((el) => el.remove());
    $('#hero').append(
      ...HERO.map(({ tier, x, y, d }, i) => {
        // thumbnails leave a 12% margin around the ball for its outline
        const box = d * 1.12;
        const img = h('img', {
          class: 'hero-friend',
          src: this.art.thumbnail(tier, 256),
          alt: '',
          'data-tier': tier,
          style: `--i:${i};left:${((x - box / 2) / 3).toFixed(2)}%;bottom:${((y - box / 2) / 1.5).toFixed(2)}%;width:${(box / 3).toFixed(2)}%`,
        });
        img.addEventListener('click', () => this.surprise(img, true));
        return img;
      }),
    );
    this.renderHowto();
  }

  /** A title friend hops with its shocked face for a moment. */
  private surprise(img: HTMLImageElement, tapped: boolean): void {
    if (img.classList.contains('hop')) return;
    const tier = Number(img.dataset.tier);
    if (tapped) {
      this.sfx.unlock();
      this.sfx.drop();
    }
    img.src = this.art.thumbnail(tier, 256, true);
    img.classList.add('hop');
    setTimeout(() => {
      img.classList.remove('hop');
      img.src = this.art.thumbnail(tier, 256);
    }, 750);
  }

  private refreshTitle(): void {
    const best = this.highScore.best;
    $('#title-best').hidden = best <= 0;
    $('#title-best-value').textContent = formatScore(best);
    // With a saved game, つづきから leads and あそぶ becomes a quieter はじめから.
    const saved = this.saves.exists;
    $('#btn-continue').hidden = !saved;
    const play = $('#btn-play');
    play.textContent = saved ? 'はじめから' : 'あそぶ';
    play.classList.toggle('btn-pink', !saved);
    play.classList.toggle('btn-big', !saved);
  }

  private openHowto(): void {
    browserStore.set(SEEN_HOWTO_KEY, '1');
    this.setHowtoPage(0, true);
    this.open('howto');
  }

  /** The あそびかた cards: one rule each, shown with the game's own pieces. */
  private renderHowto(): void {
    const ball = (tier: number, cls = '', style = '') => h('img', { src: this.art.thumbnail(tier, 96), alt: '', class: cls, style });
    const icon = (svg: string) => h('span', { html: svg });
    const cards: [Node, string][] = [
      [
        h(
          'div',
          { class: 'scene' },
          h(
            'div',
            { class: 'mini-box' },
            ball(0, '', 'left:6px;bottom:6px;width:24px'),
            ball(1, '', 'left:30px;bottom:6px;width:27px'),
            ball(3, '', 'right:6px;bottom:6px;width:51px'),
          ),
          h('i', { class: 'guide-dots' }),
          ball(2, 'drop-ball'),
        ),
        'ねらって はなすと、なかまが おちるよ。',
      ],
      [
        h(
          'div',
          { class: 'merge-scene' },
          h('div', { class: 'equation' }, ball(2), '+', ball(2), '→', ball(3, 'big')),
          h('div', { class: 'chain' }, ...TIERS.map((_, i) => ball(i, '', `--i:${i}`))),
        ),
        'おなじ なかまが くっつくと、おおきく なるよ。',
      ],
      [
        h('div', { class: 'equation' }, ball(MAX_TIER), '+', ball(MAX_TIER), '→', icon(UI_ICONS.sparkle)),
        'いちばん おおきな なかまどうしは、きえるよ。',
      ],
      [
        h(
          'div',
          { class: 'scene' },
          h(
            'div',
            { class: 'mini-box' },
            h('i', { class: 'mini-line' }),
            ball(4, '', 'left:6px;bottom:6px;width:58px'),
            ball(3, '', 'left:64px;bottom:6px;width:46px'),
            ball(2, '', 'right:6px;bottom:6px;width:34px'),
            ball(3, 'mini-over', 'left:24px;bottom:58px;width:46px'),
          ),
        ),
        'せんより うえに いつづけると、おしまい。',
      ],
      [
        h(
          'div',
          { class: 'ab-grid' },
          ...ABILITY_IDS.map((id) => h('div', { class: 'ab-mini', html: `<span class="blob">${ICONS[id]}</span><span>${ABILITY_INFO[id].name}</span>` })),
        ),
        'なかまを くっつけると、とくぎが たまるよ。',
      ],
    ];
    $('#howto-cards').replaceChildren(...cards.map(([art, text]) => h('section', { class: 'card' }, art, h('p', {}, text))));
    $('#howto-dots').replaceChildren(...cards.map(() => h('i')));
    this.setHowtoPage(this.howtoPage, false);
  }

  private bindHowto(): void {
    const cards = $('#howto-cards');
    // Swiping moves between cards too; keep the dots and the button in step.
    cards.addEventListener(
      'scroll',
      () => {
        const page = Math.round(cards.scrollLeft / Math.max(1, cards.clientWidth));
        if (page !== this.howtoPage) this.setHowtoPage(page, false);
      },
      { passive: true },
    );
    $('#howto-next').addEventListener('click', () => {
      this.sfx.click();
      if (this.howtoPage >= cards.children.length - 1) this.back();
      else this.setHowtoPage(this.howtoPage + 1, true);
    });
    window.addEventListener('keydown', (e) => {
      if (this.screen !== 'howto' || (e.code !== 'ArrowLeft' && e.code !== 'ArrowRight')) return;
      this.setHowtoPage(this.howtoPage + (e.code === 'ArrowRight' ? 1 : -1), true);
    });
  }

  private setHowtoPage(page: number, scroll: boolean): void {
    const cards = $('#howto-cards');
    const last = cards.children.length - 1;
    this.howtoPage = Math.max(0, Math.min(last, page));
    if (scroll) {
      const smooth = !this.settings.value.reduceMotion && this.screen === 'howto';
      cards.scrollTo({ left: this.howtoPage * cards.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
    }
    [...$('#howto-dots').children].forEach((dot, i) => dot.classList.toggle('on', i === this.howtoPage));
    $('#howto-next').textContent = this.howtoPage >= last ? 'OK' : 'つぎへ';
  }

  private bindMenus(): void {
    const actions: Record<string, () => void> = {
      play: () =>
        this.saves.exists ? this.ask('つづきの ゲームは きえるよ。はじめから あそぶ?', 'はじめる', () => this.play()) : this.play(),
      continue: () => this.continueGame(),
      restart: () => this.newGame(),
      resume: () => this.resume(),
      title: () => this.toTitle(),
      howto: () => this.openHowto(),
      settings: () => this.open('settings'),
      back: () => this.back(),
      'ask-restart': () => this.ask('さいしょから やりなおす?', 'はい', () => this.newGame()),
      'ask-title': () => this.ask('タイトルに もどる?', 'はい', () => this.toTitle()),
    };
    document.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (!btn) return;
      this.sfx.unlock();
      this.sfx.click();
      actions[btn.dataset.action ?? '']?.();
    });
    $('#btn-menu').addEventListener('click', (e) => {
      (e.currentTarget as HTMLElement).blur();
      this.sfx.unlock();
      this.sfx.click();
      this.pause();
    });
    $('#btn-friends').addEventListener('click', (e) => {
      (e.currentTarget as HTMLElement).blur();
      if (!this.playing) return;
      this.sfx.click();
      this.backStack = [];
      this.show('friends');
    });
    $('#ability-use').addEventListener('click', () => this.useDialogAbility());
    $('#confirm-ok').addEventListener('click', () => {
      const action = this.confirmAction;
      this.confirmAction = null;
      action?.();
    });
    // Tapping the dimmed backdrop of a dialog closes it (and resumes from the pause menu).
    for (const screen of ['howto', 'friends', 'settings', 'ability', 'confirm', 'pause'] as Screen[]) {
      const el = document.getElementById(SCREEN_IDS[screen]);
      el?.addEventListener('click', (e) => {
        if (e.target !== el) return;
        if (screen === 'pause') this.resume();
        else this.back();
      });
    }
  }

  private bindSettings(): void {
    const s = this.settings;
    const sound = $('#set-sound') as HTMLInputElement;
    const music = $('#set-music') as HTMLInputElement;
    const volume = $('#set-volume') as HTMLInputElement;
    const upright = $('#set-upright') as HTMLInputElement;
    const guide = $('#set-guide') as HTMLInputElement;
    const motion = $('#set-motion') as HTMLInputElement;
    const showVolume = () => volume.style.setProperty('--val', `${Number(volume.value) * 100}%`);
    sound.checked = s.value.sound;
    music.checked = s.value.music;
    volume.value = String(s.value.volume);
    showVolume();
    upright.checked = s.value.uprightFaces;
    guide.checked = s.value.guideLine;
    motion.checked = s.value.reduceMotion;
    sound.addEventListener('change', () => s.update({ sound: sound.checked }));
    music.addEventListener('change', () => s.update({ music: music.checked }));
    volume.addEventListener('input', () => {
      showVolume();
      s.update({ volume: Number(volume.value) });
    });
    upright.addEventListener('change', () => s.update({ uprightFaces: upright.checked }));
    guide.addEventListener('change', () => s.update({ guideLine: guide.checked }));
    motion.addEventListener('change', () => s.update({ reduceMotion: motion.checked }));
    $('#btn-reset-best').addEventListener('click', () =>
      this.ask('ベストスコアを けす?', 'けす', () => {
        this.highScore.clear();
        this.hud.setBest(this.game.score);
        this.refreshTitle();
        this.back();
      }),
    );
    s.onChange(() => this.applySettings());
  }

  private applySettings(): void {
    const v = this.settings.value;
    this.sfx.setEnabled(v.sound);
    this.sfx.setVolume(v.volume);
    this.music.setEnabled(v.music);
    document.body.classList.toggle('reduce-motion', v.reduceMotion);
  }
}
