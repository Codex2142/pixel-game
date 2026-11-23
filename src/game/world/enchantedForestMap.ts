import type { EnemyKind } from '../rules/ai.ts';
import type { ItemId } from '../rules/inventory.ts';
import type { RuneId } from '../rules/puzzle.ts';

export const MAP_SIZE = 56; // 56x56 isometric tiles

export type TerrainKind =
  | 'grass_0'
  | 'grass_1'
  | 'grass_2'
  | 'dirt_path'
  | 'cobble'
  | 'ruin_floor'
  | 'vault_floor'
  | 'water'
  | 'bridge';

export type PropKind =
  | 'oak_0'
  | 'oak_1'
  | 'pine'
  | 'bush'
  | 'rock'
  | 'ruin_pillar_broken'
  | 'ruin_arch'
  | 'outpost_tent'
  | 'campfire';

export interface StaticPropPlacement {
  id: string;
  kind: PropKind;
  tx: number;
  ty: number;
  collides: boolean;
  collisionRadius?: number;
}

export interface CheckpointPlacement {
  id: string;
  name: string;
  subtitle: string;
  tx: number;
  ty: number;
  spawnTx: number;
  spawnTy: number;
}

export interface RunePillarPlacement {
  id: string;
  rune: RuneId;
  label: string;
  tx: number;
  ty: number;
}

export interface ChestPlacement {
  id: string;
  name: string;
  tx: number;
  ty: number;
  requiresVaultOpen?: boolean;
  rewards: { itemId: ItemId; quantity: number }[];
  xpReward: number;
}

export interface LoreTabletPlacement {
  id: string;
  title: string;
  tx: number;
  ty: number;
  inscription: string;
}

export interface EnemySpawnPlacement {
  id: string;
  kind: EnemyKind;
  tx: number;
  ty: number;
  patrolTiles: { tx: number; ty: number }[];
}

export interface ZoneRegion {
  id: string;
  name: string;
  subtitle: string;
  minTx: number;
  maxTx: number;
  minTy: number;
  maxTy: number;
}

export interface EnchantedForestData {
  width: number;
  height: number;
  terrain: TerrainKind[][];
  blocked: boolean[][];
  playerStart: { tx: number; ty: number };
  checkpoints: CheckpointPlacement[];
  runePillars: RunePillarPlacement[];
  vaultDoor: { tx: number; ty: number };
  dungeonGate: { tx: number; ty: number };
  chests: ChestPlacement[];
  loreTablets: LoreTabletPlacement[];
  props: StaticPropPlacement[];
  enemySpawns: EnemySpawnPlacement[];
  zones: ZoneRegion[];
}

function dist(x1: number, y1: number, x2: number, y2: number): number {
  return Math.hypot(x1 - x2, y1 - y2);
}

/**
 * Deterministically builds the 56x56 Enchanted Forest map with 7 landmarks:
 * 1. Sunlit Glade (Start & Glade Waystone Checkpoint 1) — (8..16, 24..34)
 * 2. Whispering Trail & Hidden Briargrove — (16..26, 14..38)
 * 3. Crystal Brook & Timber Bridge (+ Northern Stepping Ford) — river at tx ~ 27..28
 * 4. Abandoned Ranger Outpost — (18..24, 38..46)
 * 5. Sunken Temple Ruins & Hidden Treasure Vault — (31..43, 12..25)
 * 6. Deep Grove Sanctuary (Elder Waystone Checkpoint 2) — (34..42, 34..42)
 * 7. Ancient Dungeon Gate (Moss-Stone Sentinel Elite Arena) — (43..52, 26..36)
 */
export function buildEnchantedForestMap(): EnchantedForestData {
  const terrain: TerrainKind[][] = [];
  const blocked: boolean[][] = [];

  for (let ty = 0; ty < MAP_SIZE; ty++) {
    const tRow: TerrainKind[] = [];
    const bRow: boolean[] = [];
    for (let tx = 0; tx < MAP_SIZE; tx++) {
      const h = ((tx * 73 + ty * 151) % 97) / 97;
      tRow.push(h < 0.5 ? 'grass_0' : h < 0.78 ? 'grass_1' : 'grass_2');
      // Outer border perimeter trees block exit
      const isBorder = tx <= 2 || ty <= 2 || tx >= MAP_SIZE - 3 || ty >= MAP_SIZE - 3;
      bRow.push(isBorder);
    }
    terrain.push(tRow);
    blocked.push(bRow);
  }

  // Helper to paint terrain tiles
  const paintRect = (minX: number, minY: number, maxX: number, maxY: number, kind: TerrainKind, isBlocked = false) => {
    for (let y = Math.max(1, minY); y <= Math.min(MAP_SIZE - 2, maxY); y++) {
      for (let x = Math.max(1, minX); x <= Math.min(MAP_SIZE - 2, maxX); x++) {
        terrain[y][x] = kind;
        blocked[y][x] = isBlocked;
      }
    }
  };

  const paintRoad = (x0: number, y0: number, x1: number, y1: number, kind: TerrainKind, halfWidth = 1) => {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1) * 2;
    for (let i = 0; i <= steps; i++) {
      const cx = Math.round(x0 + ((x1 - x0) * i) / steps);
      const cy = Math.round(y0 + ((y1 - y0) * i) / steps);
      for (let dy = -halfWidth; dy <= halfWidth; dy++) {
        for (let dx = -halfWidth; dx <= halfWidth; dx++) {
          const tx = cx + dx;
          const ty = cy + dy;
          if (tx > 2 && ty > 2 && tx < MAP_SIZE - 3 && ty < MAP_SIZE - 3) {
            terrain[ty][tx] = kind;
            blocked[ty][tx] = false;
          }
        }
      }
    }
  };

  // 1. Crystal Brook River running North-to-South across the valley (around tx = 27 + sin wave)
  for (let ty = 1; ty < MAP_SIZE - 1; ty++) {
    const riverCenter = 27 + Math.round(Math.sin(ty * 0.14) * 1.5);
    for (let dx = -1; dx <= 1; dx++) {
      const rx = riverCenter + dx;
      if (rx >= 1 && rx < MAP_SIZE - 1) {
        terrain[ty][rx] = 'water';
        blocked[ty][rx] = true;
      }
    }
  }

  // 2. Main Cobblestone & Dirt Roads connecting all landmarks
  // Sunlit Glade (10, 28) -> Whispering Trail -> Timber Bridge (27, 28)
  paintRoad(9, 28, 25, 28, 'cobble', 1);
  // Timber Bridge across Crystal Brook (ty 27..29, tx 25..30)
  paintRect(25, 27, 30, 29, 'bridge', false);
  // Northern Optional Stepping-Stone Ford across Crystal Brook (ty 15..16, tx 25..30)
  paintRect(25, 15, 30, 16, 'ruin_floor', false);

  // Optional branch: Whispering Trail North to Hidden Briargrove Chest (18, 15) & Northern Ford
  paintRoad(18, 28, 18, 15, 'dirt_path', 1);
  paintRoad(18, 15, 25, 15, 'dirt_path', 1);

  // Branch South to Abandoned Ranger Outpost (20, 42)
  paintRoad(19, 28, 20, 42, 'dirt_path', 1);
  paintRect(17, 40, 23, 45, 'dirt_path', false);

  // East of Bridge -> Split to Sunken Temple Ruins (North-East), Deep Grove Checkpoint (South-East), and Dungeon Gate (East)
  paintRoad(30, 28, 37, 28, 'cobble', 1);
  // North-East branch to Sunken Temple Ruins (37, 19)
  paintRoad(35, 28, 36, 20, 'cobble', 1);
  // Connect Northern Ford to Sunken Temple Ruins
  paintRoad(30, 15, 34, 18, 'dirt_path', 1);

  // Sunken Temple Ruins Courtyard (tx 33..41, ty 14..22)
  paintRect(33, 14, 41, 22, 'ruin_floor', false);
  // Hidden Treasure Vault room behind the Vault Door at (37, 13) -> Vault interior (35..39, 8..12)
  paintRect(35, 8, 39, 12, 'vault_floor', false);
  // Enclose the Hidden Vault with impassable ruin perimeter except the Vault Door tile (37, 13)
  for (let tx = 34; tx <= 40; tx++) {
    for (let ty = 7; ty <= 13; ty++) {
      const isInterior = tx >= 35 && tx <= 39 && ty >= 8 && ty <= 12;
      if (!isInterior) {
        terrain[ty][tx] = 'ruin_floor';
        blocked[ty][tx] = true;
      }
    }
  }
  // Vault Doorway tile at (37, 13) starts blocked until the 3-pillar puzzle is solved!
  terrain[13][37] = 'vault_floor';
  blocked[13][37] = true;

  // South-East road to Deep Grove Sanctuary (Checkpoint 2 at 37, 38)
  paintRoad(36, 28, 37, 38, 'cobble', 1);
  paintRect(34, 36, 40, 41, 'cobble', false);

  // East road from Deep Grove & Crossroads to Ancient Dungeon Gate Plaza (47, 30)
  paintRoad(37, 28, 45, 30, 'cobble', 1);
  paintRoad(39, 38, 45, 32, 'dirt_path', 1);
  paintRect(43, 26, 50, 34, 'ruin_floor', false);

  // Sunlit Glade starter plaza
  paintRect(8, 25, 13, 31, 'cobble', false);

  const checkpoints: CheckpointPlacement[] = [
    {
      id: 'glade_waystone',
      name: 'Sunlit Glade Waystone',
      subtitle: 'Western Forest Edge • Starting Sanctuary',
      tx: 10,
      ty: 26,
      spawnTx: 11,
      spawnTy: 28,
    },
    {
      id: 'elder_waystone',
      name: 'Deep Grove Waystone',
      subtitle: 'Eastern Elderwood • Before the Sealed Dungeon',
      tx: 37,
      ty: 37,
      spawnTx: 37,
      spawnTy: 39,
    },
  ];

  // Mark checkpoint footprints as non-walkable collision centers
  for (const cp of checkpoints) {
    blocked[cp.ty][cp.tx] = true;
  }

  const runePillars: RunePillarPlacement[] = [
    {
      id: 'pillar_moon',
      rune: 'moon',
      label: 'Crescent Moon Pillar',
      tx: 34,
      ty: 18,
    },
    {
      id: 'pillar_sun',
      rune: 'sun',
      label: 'Radiant Sun Pillar',
      tx: 37,
      ty: 16,
    },
    {
      id: 'pillar_star',
      rune: 'star',
      label: 'Eternal Star Pillar',
      tx: 40,
      ty: 18,
    },
  ];
  for (const p of runePillars) {
    blocked[p.ty][p.tx] = true;
  }

  const vaultDoor = { tx: 37, ty: 13 };
  const dungeonGate = { tx: 49, ty: 29 };
  blocked[dungeonGate.ty][dungeonGate.tx] = true;

  const chests: ChestPlacement[] = [
    {
      id: 'chest_briargrove',
      name: 'Briargrove Ranger Cache',
      tx: 16,
      ty: 14,
      rewards: [
        { itemId: 'health_potion', quantity: 2 },
        { itemId: 'stamina_potion', quantity: 1 },
      ],
      xpReward: 35,
    },
    {
      id: 'chest_outpost',
      name: 'Outpost Supply Chest',
      tx: 22,
      ty: 44,
      rewards: [
        { itemId: 'stamina_potion', quantity: 2 },
        { itemId: 'health_potion', quantity: 1 },
      ],
      xpReward: 40,
    },
    {
      id: 'chest_hidden_vault',
      name: 'Sunken Temple Royal Reliquary',
      tx: 37,
      ty: 10,
      requiresVaultOpen: true,
      rewards: [
        { itemId: 'sunstone_relic', quantity: 1 },
        { itemId: 'health_potion', quantity: 2 },
        { itemId: 'stamina_potion', quantity: 2 },
      ],
      xpReward: 100,
    },
  ];
  for (const c of chests) {
    blocked[c.ty][c.tx] = true;
  }

  const loreTablets: LoreTabletPlacement[] = [
    {
      id: 'tablet_glade',
      title: 'Wayfarer Chronicle I',
      tx: 13,
      ty: 26,
      inscription:
        '"Sir Aldric: Strike with [Left-Click], unleash Arcane Bolt with [Right-Click / Q], and Dodge with [Space]. Activate Waystone Shrines to heal, save, and fast-travel."',
    },
    {
      id: 'tablet_outpost',
      title: 'Ranger Captain Journal',
      tx: 19,
      ty: 41,
      inscription:
        '"We deciphered the Sunken Temple lock before the goblins overran our camp: awaken the three celestial pillars in order — First the silver MOON, second the golden SUN, third the eternal STAR."',
    },
    {
      id: 'tablet_ruins',
      title: 'Weathered Temple Frieze',
      tx: 35,
      ty: 21,
      inscription:
        '"Three mechanisms guard the Sunstone Vault: Night yields to Dawn, and Dawn ascends to the Astral heavens (Moon -> Sun -> Star)."',
    },
  ];
  for (const t of loreTablets) {
    blocked[t.ty][t.tx] = true;
  }

  // Place curated landmark props + organic forest trees/rocks/bushes
  const props: StaticPropPlacement[] = [
    // Outpost structures
    { id: 'outpost_tent_1', kind: 'outpost_tent', tx: 18, ty: 43, collides: true, collisionRadius: 22 },
    { id: 'outpost_fire', kind: 'campfire', tx: 20, ty: 43, collides: true, collisionRadius: 14 },
    // Sunken Temple arches & broken columns
    { id: 'ruin_arch_entry', kind: 'ruin_arch', tx: 36, ty: 22, collides: false },
    { id: 'ruin_col_1', kind: 'ruin_pillar_broken', tx: 33, ty: 15, collides: true, collisionRadius: 14 },
    { id: 'ruin_col_2', kind: 'ruin_pillar_broken', tx: 41, ty: 15, collides: true, collisionRadius: 14 },
    { id: 'ruin_col_3', kind: 'ruin_pillar_broken', tx: 33, ty: 21, collides: true, collisionRadius: 14 },
    { id: 'ruin_col_4', kind: 'ruin_pillar_broken', tx: 41, ty: 21, collides: true, collisionRadius: 14 },
    // Deep Grove campfire
    { id: 'grove_fire', kind: 'campfire', tx: 39, ty: 38, collides: true, collisionRadius: 14 },
  ];

  // Vault perimeter stone pillars so the secret room is visually framed
  for (let tx = 34; tx <= 40; tx += 2) {
    props.push({
      id: `vault_wall_top_${tx}`,
      kind: 'ruin_pillar_broken',
      tx,
      ty: 7,
      collides: true,
      collisionRadius: 16,
    });
  }
  for (const tx of [34, 40]) {
    for (let ty = 9; ty <= 13; ty += 2) {
      props.push({
        id: `vault_wall_side_${tx}_${ty}`,
        kind: 'ruin_pillar_broken',
        tx,
        ty,
        collides: true,
        collisionRadius: 16,
      });
    }
  }

  // Populate dense forest trees, boulders, and bushes around grass tiles (respecting roads & landmarks)
  const isReserved = (tx: number, ty: number): boolean => {
    if (terrain[ty][tx] !== 'grass_0' && terrain[ty][tx] !== 'grass_1' && terrain[ty][tx] !== 'grass_2') {
      return true;
    }
    // Keep clear margin around checkpoints, pillars, chests, doors, and spawn
    if (dist(tx, ty, 11, 28) < 4) return true;
    for (const cp of checkpoints) if (dist(tx, ty, cp.tx, cp.ty) < 3.5) return true;
    for (const rp of runePillars) if (dist(tx, ty, rp.tx, rp.ty) < 3) return true;
    for (const ch of chests) if (dist(tx, ty, ch.tx, ch.ty) < 2.8) return true;
    if (dist(tx, ty, vaultDoor.tx, vaultDoor.ty) < 3.5) return true;
    if (dist(tx, ty, dungeonGate.tx, dungeonGate.ty) < 4.5) return true;
    if (tx >= 33 && tx <= 41 && ty >= 7 && ty <= 23) return true;
    return false;
  };

  let propCounter = 0;
  for (let ty = 2; ty < MAP_SIZE - 2; ty += 2) {
    for (let tx = 2; tx < MAP_SIZE - 2; tx += 2) {
      const isBorderRing = tx <= 3 || ty <= 3 || tx >= MAP_SIZE - 4 || ty >= MAP_SIZE - 4;
      if (isBorderRing) {
        if (terrain[ty][tx] !== 'water') {
          const kind: PropKind = (tx + ty) % 3 === 0 ? 'pine' : (tx + ty) % 2 === 0 ? 'oak_0' : 'oak_1';
          props.push({
            id: `border_tree_${propCounter++}`,
            kind,
            tx,
            ty,
            collides: true,
            collisionRadius: 18,
          });
          blocked[ty][tx] = true;
        }
        continue;
      }

      if (isReserved(tx, ty)) continue;

      // Check neighbor road clearance so roads are never pinched
      let nearRoad = false;
      for (let ny = ty - 1; ny <= ty + 1; ny++) {
        for (let nx = tx - 1; nx <= tx + 1; nx++) {
          const t = terrain[ny]?.[nx];
          if (t === 'cobble' || t === 'dirt_path' || t === 'bridge' || t === 'water') {
            nearRoad = true;
          }
        }
      }
      if (nearRoad) continue;

      const roll = ((tx * 193 + ty * 389) % 101) / 101;
      if (roll < 0.24) {
        const kind: PropKind = roll < 0.09 ? 'oak_0' : roll < 0.17 ? 'oak_1' : 'pine';
        props.push({
          id: `forest_tree_${propCounter++}`,
          kind,
          tx,
          ty,
          collides: true,
          collisionRadius: 16,
        });
        blocked[ty][tx] = true;
      } else if (roll < 0.31) {
        props.push({
          id: `forest_rock_${propCounter++}`,
          kind: 'rock',
          tx,
          ty,
          collides: true,
          collisionRadius: 13,
        });
        blocked[ty][tx] = true;
      } else if (roll < 0.4) {
        props.push({
          id: `forest_bush_${propCounter++}`,
          kind: 'bush',
          tx,
          ty,
          collides: false,
        });
      }
    }
  }

  for (const p of props) {
    if (p.collides && p.ty >= 0 && p.ty < MAP_SIZE && p.tx >= 0 && p.tx < MAP_SIZE) {
      blocked[p.ty][p.tx] = true;
    }
  }

  // Curated enemy encounters across the forest
  const enemySpawns: EnemySpawnPlacement[] = [
    {
      id: 'goblin_trail_1',
      kind: 'goblin',
      tx: 19,
      ty: 28,
      patrolTiles: [
        { tx: 17, ty: 28 },
        { tx: 22, ty: 28 },
      ],
    },
    {
      id: 'goblin_briar_2',
      kind: 'goblin',
      tx: 18,
      ty: 18,
      patrolTiles: [
        { tx: 18, ty: 21 },
        { tx: 18, ty: 16 },
      ],
    },
    {
      id: 'goblin_outpost_3',
      kind: 'goblin',
      tx: 20,
      ty: 39,
      patrolTiles: [
        { tx: 18, ty: 40 },
        { tx: 22, ty: 41 },
      ],
    },
    {
      id: 'goblin_outpost_4',
      kind: 'goblin',
      tx: 21,
      ty: 44,
      patrolTiles: [
        { tx: 21, ty: 44 },
        { tx: 18, ty: 42 },
      ],
    },
    {
      id: 'goblin_east_5',
      kind: 'goblin',
      tx: 33,
      ty: 28,
      patrolTiles: [
        { tx: 31, ty: 28 },
        { tx: 36, ty: 28 },
      ],
    },
    {
      id: 'goblin_ruins_6',
      kind: 'goblin',
      tx: 38,
      ty: 20,
      patrolTiles: [
        { tx: 35, ty: 20 },
        { tx: 40, ty: 20 },
      ],
    },
    {
      id: 'sentinel_dungeon_boss',
      kind: 'sentinel',
      tx: 46,
      ty: 30,
      patrolTiles: [
        { tx: 45, ty: 28 },
        { tx: 46, ty: 32 },
      ],
    },
  ];

  const zones: ZoneRegion[] = [
    {
      id: 'sunlit_glade',
      name: 'Sunlit Glade',
      subtitle: 'Western Sanctuary of Aethelgard',
      minTx: 4,
      maxTx: 15,
      minTy: 22,
      maxTy: 34,
    },
    {
      id: 'whispering_trail',
      name: 'Whispering Trail',
      subtitle: 'Ancient King’s Road & Briargrove',
      minTx: 16,
      maxTx: 25,
      minTy: 11,
      maxTy: 35,
    },
    {
      id: 'ranger_outpost',
      name: 'Abandoned Ranger Outpost',
      subtitle: 'Overrun Watchcamp',
      minTx: 15,
      maxTx: 25,
      minTy: 36,
      maxTy: 48,
    },
    {
      id: 'crystal_brook',
      name: 'Crystal Brook Crossing',
      subtitle: 'Timber Bridge & Northern Ford',
      minTx: 25,
      maxTx: 31,
      minTy: 12,
      maxTy: 34,
    },
    {
      id: 'sunken_temple',
      name: 'Sunken Temple Ruins',
      subtitle: 'Sanctuary of Moon, Sun, and Star',
      minTx: 32,
      maxTx: 42,
      minTy: 7,
      maxTy: 23,
    },
    {
      id: 'deep_grove',
      name: 'Deep Grove Sanctuary',
      subtitle: 'Elder Waystone Shrine',
      minTx: 33,
      maxTx: 42,
      minTy: 34,
      maxTy: 44,
    },
    {
      id: 'dungeon_gate',
      name: 'Sealed Dungeon Gate',
      subtitle: 'Domain of the Moss-Stone Sentinel',
      minTx: 43,
      maxTx: 52,
      minTy: 24,
      maxTy: 36,
    },
  ];

  return {
    width: MAP_SIZE,
    height: MAP_SIZE,
    terrain,
    blocked,
    playerStart: { tx: 11, ty: 28 },
    checkpoints,
    runePillars,
    vaultDoor,
    dungeonGate,
    chests,
    loreTablets,
    props,
    enemySpawns,
    zones,
  };
}
