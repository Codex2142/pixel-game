export const TILE_W = 64;
export const TILE_H = 32;
export const HALF_W = TILE_W / 2; // 32
export const HALF_H = TILE_H / 2; // 16

export interface Vec2 {
  x: number;
  y: number;
}

/**
 * All 8 player and equipment directions, ordered clockwise starting from South (row 0..7 in modular sheets).
 */
export type Direction8 = 'S' | 'SW' | 'W' | 'NW' | 'N' | 'NE' | 'E' | 'SE';

export const DIRECTION_8_LIST: readonly Direction8[] = [
  'S',
  'SW',
  'W',
  'NW',
  'N',
  'NE',
  'E',
  'SE',
] as const;

export const DIRECTION_ROW_INDEX: Record<Direction8, number> = {
  S: 0,
  SW: 1,
  W: 2,
  NW: 3,
  N: 4,
  NE: 5,
  E: 6,
  SE: 7,
};

export function tileToScreen(tx: number, ty: number, originX = 0, originY = 0): Vec2 {
  return {
    x: originX + (tx - ty) * HALF_W,
    y: originY + (tx + ty) * HALF_H,
  };
}

export function screenToTile(sx: number, sy: number, originX = 0, originY = 0): Vec2 {
  const dx = sx - originX;
  const dy = sy - originY;
  return {
    x: (dx / HALF_W + dy / HALF_H) / 2,
    y: (dy / HALF_H - dx / HALF_W) / 2,
  };
}

export function screenInputToVelocity(inputX: number, inputY: number, speed: number): Vec2 {
  if (inputX === 0 && inputY === 0) {
    return { x: 0, y: 0 };
  }
  const len = Math.hypot(inputX, inputY);
  const nx = inputX / len;
  const ny = inputY / len;
  return {
    x: nx * speed,
    y: ny * speed * 0.82,
  };
}

/**
 * Maps a 2D vector (vx, vy) where +X is Right/East and +Y is Down/South to one of the 8 directions.
 */
export function vectorToDirection8(
  vx: number,
  vy: number,
  fallback: Direction8 = 'SE'
): Direction8 {
  if (Math.abs(vx) < 0.001 && Math.abs(vy) < 0.001) return fallback;
  const angle = Math.atan2(vy, vx); // -PI..PI, where 0 is East, PI/2 is South
  // Sector size = PI / 4 (45 deg)
  const sector = Math.round(angle / (Math.PI / 4));
  switch (sector) {
    case 0:
      return 'E';
    case 1:
      return 'SE';
    case 2:
      return 'S';
    case 3:
      return 'SW';
    case 4:
    case -4:
      return 'W';
    case -3:
      return 'NW';
    case -2:
      return 'N';
    case -1:
      return 'NE';
    default:
      return fallback;
  }
}

export function direction8ToUnitVector(dir: Direction8): Vec2 {
  const SQRT1_2 = Math.SQRT1_2;
  switch (dir) {
    case 'S':
      return { x: 0, y: 1 };
    case 'SW':
      return { x: -SQRT1_2, y: SQRT1_2 };
    case 'W':
      return { x: -1, y: 0 };
    case 'NW':
      return { x: -SQRT1_2, y: -SQRT1_2 };
    case 'N':
      return { x: 0, y: -1 };
    case 'NE':
      return { x: SQRT1_2, y: -SQRT1_2 };
    case 'E':
      return { x: 1, y: 0 };
    case 'SE':
      return { x: SQRT1_2, y: SQRT1_2 };
  }
}
