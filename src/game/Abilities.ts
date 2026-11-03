import { GAME, type AbilityId, type AbilityRule } from '../config/game';

export const ABILITY_IDS: readonly AbilityId[] = ['shake', 'remove', 'pick', 'flip'];

export interface Charge {
  charges: number;
  /** Merges collected toward the next charge. */
  progress: number;
}

/**
 * Ability charges. Every merge (not every drop) fills each ability's meter; a full meter
 * gives one charge. Abilities are earned by playing well, not just by playing fast.
 */
export class Abilities {
  private readonly state = {} as Record<AbilityId, Charge>;

  constructor(private readonly rules: Record<AbilityId, AbilityRule> = GAME.abilities) {
    this.reset();
  }

  reset(): void {
    for (const id of ABILITY_IDS) this.state[id] = { charges: this.rules[id].startCharges, progress: 0 };
  }

  save(): Record<AbilityId, Charge> {
    return Object.fromEntries(ABILITY_IDS.map((id) => [id, { ...this.state[id] }])) as Record<AbilityId, Charge>;
  }

  /** Restores saved charges, clamped to the current rules. */
  load(saved: Partial<Record<AbilityId, Charge>>): void {
    for (const id of ABILITY_IDS) {
      const s = saved[id];
      if (!s) continue;
      const rule = this.rules[id];
      this.state[id] = {
        charges: Math.max(0, Math.min(rule.maxCharges, Math.floor(s.charges) || 0)),
        progress: Math.max(0, Math.min(rule.mergesPerCharge - 1, Math.floor(s.progress) || 0)),
      };
    }
  }

  charges(id: AbilityId): number {
    return this.state[id].charges;
  }

  max(id: AbilityId): number {
    return this.rules[id].maxCharges;
  }

  /** 0..1 progress toward the next charge (1 when already full). */
  progress(id: AbilityId): number {
    const s = this.state[id];
    const rule = this.rules[id];
    if (s.charges >= rule.maxCharges) return 1;
    return s.progress / rule.mergesPerCharge;
  }

  has(id: AbilityId): boolean {
    return this.state[id].charges > 0;
  }

  consume(id: AbilityId): boolean {
    const s = this.state[id];
    if (s.charges <= 0) return false;
    s.charges--;
    return true;
  }

  /** Call once per merge. Returns the abilities that just gained a charge. */
  onMerge(): AbilityId[] {
    const gained: AbilityId[] = [];
    for (const id of ABILITY_IDS) {
      const s = this.state[id];
      const rule = this.rules[id];
      if (s.charges >= rule.maxCharges) {
        s.progress = 0;
        continue;
      }
      s.progress++;
      if (s.progress >= rule.mergesPerCharge) {
        s.progress = 0;
        s.charges++;
        gained.push(id);
      }
    }
    return gained;
  }
}
