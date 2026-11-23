export type EnemyKind = 'goblin' | 'sentinel';

export type EnemyFsmState =
  | 'idle'
  | 'patrol'
  | 'chase'
  | 'windup'
  | 'attack'
  | 'recover'
  | 'hurt'
  | 'dead';

export interface EnemyArchetype {
  kind: EnemyKind;
  name: string;
  isElite: boolean;
  maxHp: number;
  attack: number;
  defense: number;
  xpReward: number;
  moveSpeed: number;
  chaseSpeed: number;
  aggroRange: number;
  leashRange: number; // Greater than aggroRange to prevent threshold flicker (game-ai skill)
  attackRange: number;
  windupDuration: number;
  attackDuration: number;
  recoverDuration: number;
  hurtDuration: number;
  aoeRadius?: number;
}

export const ENEMY_ARCHETYPES: Record<EnemyKind, EnemyArchetype> = {
  goblin: {
    kind: 'goblin',
    name: 'Goblin Scout',
    isElite: false,
    maxHp: 46,
    attack: 12,
    defense: 4,
    xpReward: 40,
    moveSpeed: 54,
    chaseSpeed: 88,
    aggroRange: 175,
    leashRange: 255,
    attackRange: 44,
    windupDuration: 0.34,
    attackDuration: 0.18,
    recoverDuration: 0.55,
    hurtDuration: 0.22,
  },
  sentinel: {
    kind: 'sentinel',
    name: 'Moss-Stone Sentinel',
    isElite: true,
    maxHp: 210,
    attack: 26,
    defense: 14,
    xpReward: 160,
    moveSpeed: 36,
    chaseSpeed: 60,
    aggroRange: 215,
    leashRange: 320,
    attackRange: 72,
    windupDuration: 0.78, // Clear telegraphed ground-slam warning
    attackDuration: 0.24,
    recoverDuration: 0.9,
    hurtDuration: 0.18,
    aoeRadius: 88,
  },
};

export interface EnemyBrainState {
  id: string;
  kind: EnemyKind;
  state: EnemyFsmState;
  stateTimer: number;
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  patrolPoints: { x: number; y: number }[];
  patrolIndex: number;
  hitDeliveredThisAttack: boolean;
}

export function createEnemyBrain(
  id: string,
  kind: EnemyKind,
  x: number,
  y: number,
  patrolPoints: { x: number; y: number }[] = []
): EnemyBrainState {
  const arch = ENEMY_ARCHETYPES[kind];
  return {
    id,
    kind,
    state: 'idle',
    stateTimer: 0.8,
    hp: arch.maxHp,
    maxHp: arch.maxHp,
    x,
    y,
    homeX: x,
    homeY: y,
    patrolPoints: patrolPoints.length > 0 ? patrolPoints : [{ x, y }],
    patrolIndex: 0,
    hitDeliveredThisAttack: false,
  };
}

export interface EnemyStepIntent {
  vx: number;
  vy: number;
  triggerHitCheck: boolean;
  telegraphRatio: number; // 0..1 during windup
}

export function transitionEnemyState(brain: EnemyBrainState, next: EnemyFsmState, duration = 0): void {
  if (brain.state === 'dead') return;
  brain.state = next;
  brain.stateTimer = duration;
  if (next === 'windup') {
    brain.hitDeliveredThisAttack = false;
  }
}

/**
 * Pure AI step function (game-ai skill: perceive -> decide -> steer).
 */
export function stepEnemyBrain(
  brain: EnemyBrainState,
  playerX: number,
  playerY: number,
  playerAlive: boolean,
  dt: number
): EnemyStepIntent {
  if (brain.state === 'dead') {
    return { vx: 0, vy: 0, triggerHitCheck: false, telegraphRatio: 0 };
  }

  const arch = ENEMY_ARCHETYPES[brain.kind];
  const distToPlayer = Math.hypot(playerX - brain.x, playerY - brain.y);
  const distToHome = Math.hypot(brain.homeX - brain.x, brain.homeY - brain.y);

  brain.stateTimer = Math.max(0, brain.stateTimer - dt);

  switch (brain.state) {
    case 'hurt': {
      if (brain.stateTimer <= 0) {
        transitionEnemyState(brain, playerAlive && distToPlayer <= arch.leashRange ? 'chase' : 'idle', 0.4);
      }
      return { vx: 0, vy: 0, triggerHitCheck: false, telegraphRatio: 0 };
    }

    case 'idle': {
      if (playerAlive && distToPlayer <= arch.aggroRange) {
        transitionEnemyState(brain, 'chase');
        break;
      }
      if (brain.stateTimer <= 0 && brain.patrolPoints.length > 1) {
        brain.patrolIndex = (brain.patrolIndex + 1) % brain.patrolPoints.length;
        transitionEnemyState(brain, 'patrol');
      }
      return { vx: 0, vy: 0, triggerHitCheck: false, telegraphRatio: 0 };
    }

    case 'patrol': {
      if (playerAlive && distToPlayer <= arch.aggroRange) {
        transitionEnemyState(brain, 'chase');
        break;
      }
      const target = brain.patrolPoints[brain.patrolIndex] ?? { x: brain.homeX, y: brain.homeY };
      const dx = target.x - brain.x;
      const dy = target.y - brain.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= Math.max(8, arch.moveSpeed * dt)) {
        transitionEnemyState(brain, 'idle', 1.2);
        return { vx: 0, vy: 0, triggerHitCheck: false, telegraphRatio: 0 };
      }
      return {
        vx: (dx / dist) * arch.moveSpeed,
        vy: (dy / dist) * arch.moveSpeed,
        triggerHitCheck: false,
        telegraphRatio: 0,
      };
    }

    case 'chase': {
      // Hysteresis check: only give up chase when player exceeds leashRange or strays too far from home
      if (!playerAlive || distToPlayer > arch.leashRange || distToHome > arch.leashRange * 1.45) {
        brain.patrolIndex = 0;
        transitionEnemyState(brain, 'patrol');
        return { vx: 0, vy: 0, triggerHitCheck: false, telegraphRatio: 0 };
      }
      if (distToPlayer <= arch.attackRange) {
        transitionEnemyState(brain, 'windup', arch.windupDuration);
        return { vx: 0, vy: 0, triggerHitCheck: false, telegraphRatio: 0.05 };
      }
      const dx = playerX - brain.x;
      const dy = playerY - brain.y;
      const len = Math.max(0.001, Math.hypot(dx, dy));
      return {
        vx: (dx / len) * arch.chaseSpeed,
        vy: (dy / len) * arch.chaseSpeed,
        triggerHitCheck: false,
        telegraphRatio: 0,
      };
    }

    case 'windup': {
      const ratio = 1 - brain.stateTimer / Math.max(0.01, arch.windupDuration);
      if (brain.stateTimer <= 0) {
        transitionEnemyState(brain, 'attack', arch.attackDuration);
      }
      return { vx: 0, vy: 0, triggerHitCheck: false, telegraphRatio: Math.min(1, Math.max(0, ratio)) };
    }

    case 'attack': {
      let triggerHitCheck = false;
      if (!brain.hitDeliveredThisAttack) {
        brain.hitDeliveredThisAttack = true;
        triggerHitCheck = true;
      }
      // Goblin lunges forward slightly during attack
      let vx = 0;
      let vy = 0;
      if (brain.kind === 'goblin') {
        const dx = playerX - brain.x;
        const dy = playerY - brain.y;
        const len = Math.max(0.001, Math.hypot(dx, dy));
        vx = (dx / len) * (arch.chaseSpeed * 1.35);
        vy = (dy / len) * (arch.chaseSpeed * 1.35);
      }
      if (brain.stateTimer <= 0) {
        transitionEnemyState(brain, 'recover', arch.recoverDuration);
      }
      return { vx, vy, triggerHitCheck, telegraphRatio: 0 };
    }

    case 'recover': {
      if (brain.stateTimer <= 0) {
        transitionEnemyState(brain, playerAlive && distToPlayer <= arch.leashRange ? 'chase' : 'idle', 0.5);
      }
      return { vx: 0, vy: 0, triggerHitCheck: false, telegraphRatio: 0 };
    }
  }

  return { vx: 0, vy: 0, triggerHitCheck: false, telegraphRatio: 0 };
}
