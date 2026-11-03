import type { AbilityId } from '../config/game';

export interface InputActions {
  /** Pointer moved/pressed over the stage: canvas CSS pixel position. */
  aimAt(px: number, py: number): void;
  /** Pointer released (or clicked) on the stage. */
  release(px: number, py: number): void;
  hover(px: number, py: number): void;
  leave(): void;
  drop(): void;
  ability(id: AbilityId): void;
  pauseOrBack(): void;
  /** Any first interaction (used to unlock audio). */
  gesture(): void;
}

const ABILITY_KEYS: Record<string, AbilityId> = { Digit1: 'shake', Digit2: 'remove', Digit3: 'pick', Digit4: 'flip' };

/**
 * Pointer + keyboard input. Mouse: move to aim, click to drop. Touch: drag to aim, lift to
 * drop. Keys: ←/→ or A/D aim, Space/↓/Enter drop, 1-4 abilities, Esc/P pause.
 */
export class Input {
  /** Horizontal key direction currently held: -1, 0 or 1. */
  keyDir = 0;
  private held = new Set<string>();
  private activePointer: number | null = null;
  enabled = true;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly actions: InputActions,
  ) {
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onCancel);
    canvas.addEventListener('pointerleave', this.onLeave);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', () => {
      this.held.clear();
      this.keyDir = 0;
    });
  }

  private local(e: PointerEvent): [number, number] {
    const rect = this.canvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  private onDown = (e: PointerEvent): void => {
    this.actions.gesture();
    if (!this.enabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    this.activePointer = e.pointerId;
    this.canvas.setPointerCapture(e.pointerId);
    const [x, y] = this.local(e);
    this.actions.aimAt(x, y);
    e.preventDefault();
  };

  private onMove = (e: PointerEvent): void => {
    if (!this.enabled) return;
    const [x, y] = this.local(e);
    this.actions.hover(x, y);
    if (this.activePointer === e.pointerId || e.pointerType === 'mouse') this.actions.aimAt(x, y);
  };

  private onUp = (e: PointerEvent): void => {
    if (this.activePointer !== e.pointerId) return;
    this.activePointer = null;
    if (!this.enabled) return;
    const [x, y] = this.local(e);
    this.actions.release(x, y);
  };

  private onCancel = (e: PointerEvent): void => {
    if (this.activePointer === e.pointerId) this.activePointer = null;
  };

  private onLeave = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse') this.actions.leave();
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
    this.actions.gesture();
    if (e.code === 'Escape' || e.code === 'KeyP') {
      this.actions.pauseOrBack();
      e.preventDefault();
      return;
    }
    if (!this.enabled) return;
    // Let buttons keep their own Space/Enter behaviour when focused.
    const onButton = target?.tagName === 'BUTTON';
    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
      case 'ArrowRight':
      case 'KeyD':
        this.held.add(e.code);
        this.updateDir();
        e.preventDefault();
        break;
      case 'Space':
      case 'Enter':
      case 'ArrowDown':
      case 'KeyS':
        if (onButton && (e.code === 'Space' || e.code === 'Enter')) return;
        if (!e.repeat) this.actions.drop();
        e.preventDefault();
        break;
      default:
        if (ABILITY_KEYS[e.code] && !e.repeat) this.actions.ability(ABILITY_KEYS[e.code]);
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (this.held.delete(e.code)) this.updateDir();
  };

  private updateDir(): void {
    const left = this.held.has('ArrowLeft') || this.held.has('KeyA');
    const right = this.held.has('ArrowRight') || this.held.has('KeyD');
    this.keyDir = (right ? 1 : 0) - (left ? 1 : 0);
  }
}
