import { direction8ToUnitVector, type Direction8 } from './iso.ts';

export interface TargetCandidate {
  id: string;
  x: number;
  y: number;
  alive: boolean;
}

export interface TargetLockConfig {
  acquireRange: number; // Max range to acquire a new target (e.g. 230px)
  breakRange: number;   // Max range before an existing lock breaks (e.g. 290px, hysteresis)
}

export const DEFAULT_TARGET_LOCK_CONFIG: TargetLockConfig = {
  acquireRange: 230,
  breakRange: 295,
};

export interface TargetLockState {
  lockedTargetId: string | null;
  isManualLock: boolean; // True when player explicitly locked or switched target
  config: TargetLockConfig;
}

export function createTargetLockState(
  config: TargetLockConfig = DEFAULT_TARGET_LOCK_CONFIG
): TargetLockState {
  return {
    lockedTargetId: null,
    isManualLock: false,
    config,
  };
}

/**
 * Scores a candidate enemy for automatic target acquisition:
 * - Only considers alive enemies within `acquireRange`.
 * - Prioritizes closeness to the player and alignment with the player's 8-directional facing vector.
 * - Deterministic tie-breaking by candidate ID.
 */
export function scoreTargetCandidate(
  playerX: number,
  playerY: number,
  facing: Direction8,
  candidate: TargetCandidate,
  acquireRange: number
): number {
  if (!candidate.alive) return -Infinity;
  const dx = candidate.x - playerX;
  const dy = candidate.y - playerY;
  const dist = Math.hypot(dx, dy);
  if (dist > acquireRange) return -Infinity;

  const facingVec = direction8ToUnitVector(facing);
  const normX = dist > 0.001 ? dx / dist : facingVec.x;
  const normY = dist > 0.001 ? dy / dist : facingVec.y;
  const dot = normX * facingVec.x + normY * facingVec.y; // -1..1

  // Distance score (0..100) + facing alignment bonus (-25..+45)
  const distScore = (1 - dist / acquireRange) * 100;
  const facingBonus = dot >= 0 ? dot * 45 : dot * 25;
  return distScore + facingBonus;
}

export function findBestAutoTarget(
  playerX: number,
  playerY: number,
  facing: Direction8,
  candidates: readonly TargetCandidate[],
  acquireRange: number
): string | null {
  let bestId: string | null = null;
  let bestScore = -Infinity;

  for (const c of candidates) {
    const score = scoreTargetCandidate(playerX, playerY, facing, c, acquireRange);
    if (score === -Infinity) continue;
    if (
      score > bestScore ||
      (Math.abs(score - bestScore) < 1e-6 && bestId !== null && c.id.localeCompare(bestId) < 0)
    ) {
      bestScore = score;
      bestId = c.id;
    }
  }

  return bestId;
}

/**
 * Validates the current lock each tick or when an enemy dies/moves:
 * - Maintains current target as long as it is alive and within `breakRange` (never flickers between nearby enemies).
 * - If the current target dies or leaves `breakRange`, automatically selects the next best available enemy within `acquireRange`.
 */
export function validateOrReplaceTarget(
  state: TargetLockState,
  playerX: number,
  playerY: number,
  facing: Direction8,
  candidates: readonly TargetCandidate[],
  autoFallbackOnInvalid = true
): string | null {
  if (!state.lockedTargetId) return null;

  const current = candidates.find((c) => c.id === state.lockedTargetId);
  const isValid =
    current !== undefined &&
    current.alive &&
    Math.hypot(current.x - playerX, current.y - playerY) <= state.config.breakRange;

  if (isValid) {
    return state.lockedTargetId;
  }

  // Target died or moved out of breakRange
  if (autoFallbackOnInvalid) {
    const replacement = findBestAutoTarget(
      playerX,
      playerY,
      facing,
      candidates.filter((c) => c.id !== state.lockedTargetId),
      state.config.acquireRange
    );
    state.lockedTargetId = replacement;
    if (!replacement) {
      state.isManualLock = false;
    }
    return replacement;
  }

  state.lockedTargetId = null;
  state.isManualLock = false;
  return null;
}

/**
 * Automatic Target Acquisition when combat begins (attacking, casting, or engaging):
 * - Never overrides an existing valid target lock (especially an intentional manual selection).
 * - Acquires the highest-scoring enemy within `acquireRange` if no target is currently locked.
 */
export function acquireTargetOnCombatStart(
  state: TargetLockState,
  playerX: number,
  playerY: number,
  facing: Direction8,
  candidates: readonly TargetCandidate[]
): string | null {
  const existing = validateOrReplaceTarget(state, playerX, playerY, facing, candidates, false);
  if (existing) {
    return existing;
  }
  const acquired = findBestAutoTarget(
    playerX,
    playerY,
    facing,
    candidates,
    state.config.acquireRange
  );
  if (acquired) {
    state.lockedTargetId = acquired;
    state.isManualLock = false;
  }
  return acquired;
}

/**
 * Manual target lock toggle:
 * - If unlocked, locks onto the best candidate in range and marks `isManualLock = true`.
 * - If already locked, deactivates target lock cleanly.
 */
export function toggleManualTargetLock(
  state: TargetLockState,
  playerX: number,
  playerY: number,
  facing: Direction8,
  candidates: readonly TargetCandidate[]
): string | null {
  if (state.lockedTargetId) {
    state.lockedTargetId = null;
    state.isManualLock = false;
    return null;
  }
  const best = findBestAutoTarget(playerX, playerY, facing, candidates, state.config.acquireRange);
  state.lockedTargetId = best;
  state.isManualLock = best !== null;
  return best;
}

/**
 * Deterministic directional manual target switching:
 * - `direction`: `'left'` (counter-clockwise / screen-left) or `'right'` (clockwise / screen-right)
 *   or a specific 2D input vector `{ x, y }`.
 * - Never selects the current target if another valid enemy is within `acquireRange`.
 */
export function switchManualTarget(
  state: TargetLockState,
  playerX: number,
  playerY: number,
  facing: Direction8,
  candidates: readonly TargetCandidate[],
  direction: 'left' | 'right' | { x: number; y: number }
): string | null {
  const valid = candidates
    .filter(
      (c) =>
        c.alive && Math.hypot(c.x - playerX, c.y - playerY) <= state.config.acquireRange
    )
    .sort((a, b) => a.id.localeCompare(b.id));

  if (valid.length === 0) {
    state.lockedTargetId = null;
    state.isManualLock = false;
    return null;
  }

  if (!state.lockedTargetId || valid.length === 1) {
    const picked =
      findBestAutoTarget(playerX, playerY, facing, valid, state.config.acquireRange) ??
      valid[0].id;
    state.lockedTargetId = picked;
    state.isManualLock = true;
    return picked;
  }

  const current = valid.find((c) => c.id === state.lockedTargetId) ?? valid[0];

  if (typeof direction === 'object') {
    // Directional vector priority relative to current target (or player)
    const dirLen = Math.hypot(direction.x, direction.y) || 1;
    const ndx = direction.x / dirLen;
    const ndy = direction.y / dirLen;
    let bestId: string | null = null;
    let bestScore = -Infinity;

    for (const c of valid) {
      if (c.id === current.id) continue;
      const vx = c.x - current.x;
      const vy = c.y - current.y;
      const dist = Math.hypot(vx, vy) || 1;
      const align = (vx / dist) * ndx + (vy / dist) * ndy;
      const score = align * 100 - dist * 0.15;
      if (score > bestScore) {
        bestScore = score;
        bestId = c.id;
      }
    }
    const nextId = bestId ?? current.id;
    state.lockedTargetId = nextId;
    state.isManualLock = true;
    return nextId;
  }

  // Sort candidates deterministically by angle around player (with ID tie-breaker)
  const byAngle = [...valid].sort((a, b) => {
    const angA = Math.atan2(a.y - playerY, a.x - playerX);
    const angB = Math.atan2(b.y - playerY, b.x - playerX);
    if (Math.abs(angA - angB) > 1e-4) return angA - angB;
    return a.id.localeCompare(b.id);
  });

  const curIdx = byAngle.findIndex((c) => c.id === current.id);
  const step = direction === 'right' ? 1 : -1;
  const nextIdx = (curIdx + step + byAngle.length) % byAngle.length;
  state.lockedTargetId = byAngle[nextIdx].id;
  state.isManualLock = true;
  return state.lockedTargetId;
}
