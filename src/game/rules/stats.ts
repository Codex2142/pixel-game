export interface StatModifier {
  id: string;
  source: string;
  stat: 'maxHp' | 'maxStamina' | 'attack' | 'defense' | 'critChance';
  kind: 'flat' | 'pct';
  value: number;
}

export interface PlayerStatsState {
  level: number;
  xp: number;
  xpToNext: number;
  hp: number;
  baseMaxHp: number;
  stamina: number;
  baseMaxStamina: number;
  baseAttack: number;
  baseDefense: number;
  baseCritChance: number;
  staminaRegenDelayTimer: number;
  modifiers: StatModifier[];
}

export const STAMINA_COSTS = {
  attack: 18,
  dodge: 25,
  arcaneBolt: 24,
} as const;

export const STAMINA_REGEN_RATE = 30; // per second
export const STAMINA_REGEN_DELAY = 0.62; // seconds after last stamina spend
export const DEFENSE_K = 40; // Ratio formula constant: dmg * K / (K + def)

export function xpRequiredForLevel(level: number): number {
  return Math.round(80 * Math.pow(Math.max(1, level), 1.5));
}

export function createInitialPlayerStats(): PlayerStatsState {
  return {
    level: 1,
    xp: 0,
    xpToNext: xpRequiredForLevel(1),
    hp: 110,
    baseMaxHp: 110,
    stamina: 100,
    baseMaxStamina: 100,
    baseAttack: 18,
    baseDefense: 8,
    baseCritChance: 0.1,
    staminaRegenDelayTimer: 0,
    modifiers: [],
  };
}

/**
 * Computes derived stat using base + modifier stack (per rpg skill Pattern 1).
 */
export function getDerivedStat(
  state: PlayerStatsState,
  stat: 'maxHp' | 'maxStamina' | 'attack' | 'defense' | 'critChance'
): number {
  const baseMap = {
    maxHp: state.baseMaxHp,
    maxStamina: state.baseMaxStamina,
    attack: state.baseAttack,
    defense: state.baseDefense,
    critChance: state.baseCritChance,
  };
  let flat = 0;
  let pct = 0;
  for (const m of state.modifiers) {
    if (m.stat !== stat) continue;
    if (m.kind === 'flat') flat += m.value;
    else if (m.kind === 'pct') pct += m.value;
  }
  const raw = (baseMap[stat] + flat) * (1 + pct);
  return stat === 'critChance' ? Math.min(0.75, Math.max(0, raw)) : Math.max(1, Math.round(raw));
}

export function addModifier(state: PlayerStatsState, mod: StatModifier): void {
  state.modifiers = state.modifiers.filter((m) => m.id !== mod.id);
  state.modifiers.push(mod);
}

export function removeModifiersBySource(state: PlayerStatsState, source: string): void {
  state.modifiers = state.modifiers.filter((m) => m.source !== source);
}

export interface DamageResult {
  amount: number;
  isCrit: boolean;
}

/**
 * Ratio damage formula (rpg skill): dmg * K / (K + def), with ±10% variance and critical hit roll.
 */
export function computeDamage(
  rawAttack: number,
  targetDefense: number,
  critChance = 0.08,
  rng: () => number = Math.random
): DamageResult {
  const mitigation = DEFENSE_K / (DEFENSE_K + Math.max(0, targetDefense));
  const variance = 0.9 + rng() * 0.2; // 0.90 .. 1.10
  const isCrit = rng() < critChance;
  const critMult = isCrit ? 1.55 : 1.0;
  const amount = Math.max(1, Math.round(rawAttack * mitigation * variance * critMult));
  return { amount, isCrit };
}

export function trySpendStamina(state: PlayerStatsState, cost: number): boolean {
  if (state.stamina < cost) {
    return false;
  }
  state.stamina = Math.max(0, state.stamina - cost);
  state.staminaRegenDelayTimer = STAMINA_REGEN_DELAY;
  return true;
}

export function stepStaminaRegen(state: PlayerStatsState, dtSeconds: number, isBusy = false): void {
  if (isBusy) return;
  let remainingDt = dtSeconds;
  if (state.staminaRegenDelayTimer > 0) {
    if (remainingDt <= state.staminaRegenDelayTimer) {
      state.staminaRegenDelayTimer -= remainingDt;
      return;
    }
    remainingDt -= state.staminaRegenDelayTimer;
    state.staminaRegenDelayTimer = 0;
  }
  const maxStam = getDerivedStat(state, 'maxStamina');
  if (state.stamina < maxStam && remainingDt > 0) {
    state.stamina = Math.min(maxStam, state.stamina + STAMINA_REGEN_RATE * remainingDt);
  }
}

export function healPlayer(state: PlayerStatsState, hpAmount: number, staminaAmount = 0): void {
  const maxHp = getDerivedStat(state, 'maxHp');
  const maxStamina = getDerivedStat(state, 'maxStamina');
  state.hp = Math.min(maxHp, Math.max(0, state.hp + hpAmount));
  state.stamina = Math.min(maxStamina, Math.max(0, state.stamina + staminaAmount));
}

export interface XpGainResult {
  leveledUp: boolean;
  newLevel: number;
  levelsGained: number;
}

export function grantExperience(state: PlayerStatsState, amount: number): XpGainResult {
  if (amount <= 0) {
    return { leveledUp: false, newLevel: state.level, levelsGained: 0 };
  }
  state.xp += amount;
  let levelsGained = 0;
  while (state.xp >= state.xpToNext && state.level < 20) {
    state.xp -= state.xpToNext;
    state.level += 1;
    levelsGained += 1;
    state.baseMaxHp += 22;
    state.baseMaxStamina += 10;
    state.baseAttack += 4;
    state.baseDefense += 2;
    state.xpToNext = xpRequiredForLevel(state.level);
    // Restore HP & Stamina to full on level up
    state.hp = getDerivedStat(state, 'maxHp');
    state.stamina = getDerivedStat(state, 'maxStamina');
  }
  return {
    leveledUp: levelsGained > 0,
    newLevel: state.level,
    levelsGained,
  };
}
