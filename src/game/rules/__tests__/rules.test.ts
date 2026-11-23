import test from 'node:test';
import assert from 'node:assert/strict';
import { tileToScreen, screenToTile, screenInputToVelocity } from '../iso.ts';
import {
  createInitialPlayerStats,
  computeDamage,
  trySpendStamina,
  stepStaminaRegen,
  grantExperience,
  getDerivedStat,
  addModifier,
  removeModifiersBySource,
  STAMINA_COSTS,
} from '../stats.ts';
import {
  createInitialInventory,
  useInventoryItem,
  addItem,
  getItemCount,
} from '../inventory.ts';
import {
  createInitialPuzzleState,
  activateRunePillar,
} from '../puzzle.ts';
import {
  createEnemyBrain,
  stepEnemyBrain,
} from '../ai.ts';
import {
  saveGameState,
  loadGameState,
  PRIMARY_SAVE_KEY,
  SAVE_VERSION,
  type StorageLike,
} from '../saveSystem.ts';
import { buildEnchantedForestMap } from '../../world/enchantedForestMap.ts';
import { vectorToDirection8 } from '../iso.ts';
import {
  createTargetLockState,
  acquireTargetOnCombatStart,
  validateOrReplaceTarget,
  toggleManualTargetLock,
  switchManualTarget,
  type TargetCandidate,
} from '../targetLock.ts';
import {
  createInitialEquipmentState,
  syncEquipmentModifiers,
  canSwitchWeapon,
  switchPrimaryWeapon,
  equipItem,
  unequipSlot,
  getActiveWeaponKind,
  hasActiveShield,
  getOrderedVisualLayers,
  type CombatActionLocks,
} from '../equipment.ts';

test('Isometric 2:1 projection round-trips tileToScreen and screenToTile accurately', () => {
  const s = tileToScreen(14, 27, 500, 200);
  const t = screenToTile(s.x, s.y, 500, 200);
  assert.ok(Math.abs(t.x - 14) < 1e-6);
  assert.ok(Math.abs(t.y - 27) < 1e-6);

  const vel = screenInputToVelocity(1, 1, 160);
  assert.ok(vel.x > 0 && vel.y > 0);
  assert.ok(Math.hypot(vel.x, vel.y) <= 160);
});

test('RPG stats, modifier stack, stamina consumption/regen, and level progression work', () => {
  const stats = createInitialPlayerStats();
  const baseAtk = getDerivedStat(stats, 'attack');
  addModifier(stats, { id: 'buff1', source: 'relic', stat: 'attack', kind: 'flat', value: 6 });
  assert.equal(getDerivedStat(stats, 'attack'), baseAtk + 6);
  removeModifiersBySource(stats, 'relic');
  assert.equal(getDerivedStat(stats, 'attack'), baseAtk);

  // Stamina consumption and delay before regeneration
  assert.equal(trySpendStamina(stats, STAMINA_COSTS.dodge), true);
  assert.equal(stats.stamina, 100 - STAMINA_COSTS.dodge);
  stepStaminaRegen(stats, 0.3, false); // still inside delay
  assert.equal(stats.stamina, 100 - STAMINA_COSTS.dodge);
  stepStaminaRegen(stats, 1.0, false); // delay expires and regenerates
  assert.ok(stats.stamina > 100 - STAMINA_COSTS.dodge);

  // Insufficient stamina blocks action
  stats.stamina = 10;
  assert.equal(trySpendStamina(stats, STAMINA_COSTS.attack), false);

  // Damage ratio formula never zeroes damage
  const hit = computeDamage(20, 40, 0, () => 0.5);
  assert.ok(hit.amount >= 9 && hit.amount <= 11);

  // XP & Level up
  const res = grantExperience(stats, 120);
  assert.equal(res.leveledUp, true);
  assert.equal(stats.level, 2);
  assert.equal(stats.hp, getDerivedStat(stats, 'maxHp'));
});

test('Inventory consumables update HP/Stamina and Quest Items cannot be consumed', () => {
  const stats = createInitialPlayerStats();
  const inv = createInitialInventory();

  // Quest item cannot be consumed
  const questAttempt = useInventoryItem(inv, stats, 'wayfarer_seal');
  assert.equal(questAttempt.success, false);
  assert.equal(getItemCount(inv, 'wayfarer_seal'), 1);

  // Damage player then drink Health Potion
  stats.hp = 40;
  const potionAttempt = useInventoryItem(inv, stats, 'health_potion');
  assert.equal(potionAttempt.success, true);
  assert.equal(stats.hp, 90);
  assert.equal(getItemCount(inv, 'health_potion'), 2);

  // Adding items respects stack
  assert.equal(addItem(inv, 'sunstone_relic', 1), true);
  assert.equal(getItemCount(inv, 'sunstone_relic'), 1);
});

test('Ruined Temple 3-Rune Pillar puzzle enforces Moon -> Sun -> Star order', () => {
  const puzzle = createInitialPuzzleState();

  // Wrong initial pillar resets
  const wrong = activateRunePillar(puzzle, 'sun');
  assert.equal(wrong.status, 'reset');
  assert.equal(puzzle.solved, false);

  // Correct sequence: moon -> sun -> star
  assert.equal(activateRunePillar(puzzle, 'moon').status, 'progressed');
  assert.equal(activateRunePillar(puzzle, 'sun').status, 'progressed');
  const solved = activateRunePillar(puzzle, 'star');
  assert.equal(solved.status, 'solved');
  assert.equal(puzzle.solved, true);
});

test('Enemy AI FSM transitions cleanly with aggro/leash hysteresis', () => {
  const goblin = createEnemyBrain('g1', 'goblin', 100, 100, [
    { x: 100, y: 100 },
    { x: 180, y: 100 },
  ]);
  assert.equal(goblin.state, 'idle');

  // Player enters aggro range (175px)
  stepEnemyBrain(goblin, 220, 100, true, 0.1);
  assert.equal(goblin.state, 'chase');

  // Player moves slightly past aggroRange (200px) but inside leashRange (255px) -> stays in chase (no flicker!)
  stepEnemyBrain(goblin, 300, 100, true, 0.1);
  assert.equal(goblin.state, 'chase');

  // Player enters attack range -> transitions to windup -> attack
  stepEnemyBrain(goblin, 120, 100, true, 0.1);
  assert.equal(goblin.state, 'windup');
  stepEnemyBrain(goblin, 120, 100, true, 0.4);
  assert.equal(goblin.state, 'attack');
});

test('Save system atomic write and corrupt primary fallback to .bak', () => {
  const map = new Map<string, string>();
  const mockStorage: StorageLike = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  };

  const firstSave = {
    version: SAVE_VERSION,
    player: {
      level: 2,
      xp: 30,
      hp: 132,
      stamina: 110,
      baseMaxHp: 132,
      baseMaxStamina: 110,
      baseAttack: 22,
      baseDefense: 10,
    },
    inventory: [{ itemId: 'health_potion' as const, quantity: 2 }],
    world: {
      discoveredCheckpoints: ['glade_waystone'],
      lastCheckpointId: 'glade_waystone',
      puzzleSolved: false,
      openedChests: [],
      sentinelDefeated: false,
    },
  };
  assert.equal(saveGameState(mockStorage, firstSave), true);

  const secondSave = {
    ...firstSave,
    player: { ...firstSave.player, level: 3 },
  };
  assert.equal(saveGameState(mockStorage, secondSave), true);
  assert.equal(loadGameState(mockStorage)?.player.level, 3);

  // Simulate truncated/corrupted primary save -> loader must recover from .bak!
  mockStorage.setItem(PRIMARY_SAVE_KEY, '{"version": 1, "broken');
  const recovered = loadGameState(mockStorage);
  assert.equal(recovered?.player.level, 2);
});

test('Level Design Reachability Check: player spawn can reach all checkpoints, rune pillars, chests, and dungeon gate without soft-locks', () => {
  const map = buildEnchantedForestMap();
  const visited = new Set<string>();
  const queue: { tx: number; ty: number }[] = [map.playerStart];
  visited.add(`${map.playerStart.tx},${map.playerStart.ty}`);

  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = cur.tx + dx;
      const ny = cur.ty + dy;
      if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
      const key = `${nx},${ny}`;
      if (visited.has(key)) continue;
      if (map.blocked[ny][nx]) continue;
      visited.add(key);
      queue.push({ tx: nx, ty: ny });
    }
  }

  // Helper: an interactable object (which itself is solid) is reachable if at least one adjacent orthogonal tile is reachable
  const isAdjacentReachable = (tx: number, ty: number): boolean => {
    return (
      visited.has(`${tx},${ty}`) ||
      visited.has(`${tx + 1},${ty}`) ||
      visited.has(`${tx - 1},${ty}`) ||
      visited.has(`${tx},${ty + 1}`) ||
      visited.has(`${tx},${ty - 1}`)
    );
  };

  for (const cp of map.checkpoints) {
    assert.equal(isAdjacentReachable(cp.tx, cp.ty), true, `Checkpoint ${cp.id} unreachable`);
  }
  for (const rp of map.runePillars) {
    assert.equal(isAdjacentReachable(rp.tx, rp.ty), true, `Rune pillar ${rp.id} unreachable`);
  }
  assert.equal(isAdjacentReachable(map.vaultDoor.tx, map.vaultDoor.ty), true, 'Vault door unreachable');
  assert.equal(isAdjacentReachable(map.dungeonGate.tx, map.dungeonGate.ty), true, 'Dungeon gate unreachable');
  for (const ch of map.chests.filter((c) => !c.requiresVaultOpen)) {
    assert.equal(isAdjacentReachable(ch.tx, ch.ty), true, `Chest ${ch.id} unreachable`);
  }
});

test('Hybrid Auto-Lock System: auto-acquires in facing direction, prevents target flicker, respects manual selection, and switches deterministically', () => {
  const lock = createTargetLockState({ acquireRange: 220, breakRange: 280 });
  const candidates: TargetCandidate[] = [
    { id: 'enemy_east', x: 190, y: 100, alive: true }, // 90px East
    { id: 'enemy_west', x: 30, y: 100, alive: true },  // 70px West (slightly closer, but behind when facing East!)
    { id: 'enemy_south', x: 100, y: 185, alive: true },
  ];

  // 1. Auto-acquire prioritizes enemy in facing direction ('E') even when enemy_west is slightly closer
  const autoId = acquireTargetOnCombatStart(lock, 100, 100, 'E', candidates);
  assert.equal(autoId, 'enemy_east');
  assert.equal(lock.isManualLock, false);

  // 2. Sticky target: turning to face West does NOT constantly change an active valid target
  const retained = acquireTargetOnCombatStart(lock, 100, 100, 'W', candidates);
  assert.equal(retained, 'enemy_east');

  // 3. Manual target switch cycles deterministically
  const switchedRight = switchManualTarget(lock, 100, 100, 'E', candidates, 'right');
  assert.equal(switchedRight, 'enemy_south');
  assert.equal(lock.isManualLock, true);

  // 4. Auto-acquisition never overrides an intentional manual selection
  assert.equal(acquireTargetOnCombatStart(lock, 100, 100, 'E', candidates), 'enemy_south');

  // 5. When current target dies, automatically selects next best suitable enemy
  candidates[2].alive = false; // enemy_south dies
  const replacement = validateOrReplaceTarget(lock, 100, 100, 'E', candidates, true);
  assert.equal(replacement, 'enemy_east');

  // 6. Manual toggle deactivates lock
  assert.equal(toggleManualTargetLock(lock, 100, 100, 'E', candidates), null);
});

test('Conditional Weapon Switching & Weapon-Shield Compatibility rules work as specified', () => {
  const stats = createInitialPlayerStats();
  const loadout = createInitialEquipmentState();
  syncEquipmentModifiers(loadout, stats);

  const neutralLocks: CombatActionLocks = {
    isAttacking: false,
    isReceivingDamage: false,
    isStaggered: false,
    isDodging: false,
    isBlocking: false,
    isSwitchingWeapon: false,
  };

  // Initial state: Dagger + Shield equipped
  assert.equal(getActiveWeaponKind(loadout), 'dagger');
  assert.equal(hasActiveShield(loadout), true);

  // Cannot switch weapons while attacking, taking damage, or staggered
  assert.equal(
    canSwitchWeapon({ ...neutralLocks, isAttacking: true }).allowed,
    false
  );
  assert.equal(
    canSwitchWeapon({ ...neutralLocks, isReceivingDamage: true }).allowed,
    false
  );
  assert.equal(
    canSwitchWeapon({ ...neutralLocks, isStaggered: true }).allowed,
    false
  );
  assert.equal(
    switchPrimaryWeapon(loadout, stats, { ...neutralLocks, isAttacking: true }).success,
    false
  );

  // Switching from Dagger to Greatsword automatically stores the Shield!
  const toGreatsword = switchPrimaryWeapon(loadout, stats, neutralLocks);
  assert.equal(toGreatsword.success, true);
  assert.equal(toGreatsword.shieldAutoStored, true);
  assert.equal(getActiveWeaponKind(loadout), 'greatsword');
  assert.equal(loadout.equipped.offHand, null);
  assert.equal(hasActiveShield(loadout), false);

  // Cannot manually equip shield while Greatsword is equipped
  const illegalShield = equipItem(loadout, stats, 'iron_kite_shield', neutralLocks);
  assert.equal(illegalShield.success, false);

  // Switching back to Dagger automatically re-equips the stored Shield!
  const backToDagger = switchPrimaryWeapon(loadout, stats, neutralLocks);
  assert.equal(backToDagger.success, true);
  assert.equal(backToDagger.shieldAutoRestored, true);
  assert.equal(getActiveWeaponKind(loadout), 'dagger');
  assert.equal(loadout.equipped.offHand, 'iron_kite_shield');
  assert.equal(hasActiveShield(loadout), true);
});

test('Fully Visual Modular Equipment System: 8-directional support, attribute sync, and layer occlusion order', () => {
  // Verify all 8 directions map accurately
  assert.equal(vectorToDirection8(0, 1), 'S');
  assert.equal(vectorToDirection8(-1, 1), 'SW');
  assert.equal(vectorToDirection8(-1, 0), 'W');
  assert.equal(vectorToDirection8(-1, -1), 'NW');
  assert.equal(vectorToDirection8(0, -1), 'N');
  assert.equal(vectorToDirection8(1, -1), 'NE');
  assert.equal(vectorToDirection8(1, 0), 'E');
  assert.equal(vectorToDirection8(1, 1), 'SE');

  const stats = createInitialPlayerStats();
  const loadout = createInitialEquipmentState();
  syncEquipmentModifiers(loadout, stats);

  const defWithHelm = getDerivedStat(stats, 'defense');
  // Unequipping headgear removes its visual layer and recalculates stats
  const unequipRes = unequipSlot(loadout, stats, 'headgear');
  assert.equal(unequipRes.success, true);
  assert.equal(getDerivedStat(stats, 'defense'), defWithHelm - 2);

  const southLayers = getOrderedVisualLayers(loadout, 'S');
  assert.equal(southLayers.some((l) => l.slot === 'headgear'), false);
  // Facing South: accessory cloak renders behind body (index 0), weapon & shield render in front
  assert.equal(southLayers[0].slot, 'accessory');
  assert.equal(southLayers[southLayers.length - 1].slot, 'offHand');

  // Facing North: weapon & shield occluded in front of chest (rendered before body), cloak on back (last)
  const northLayers = getOrderedVisualLayers(loadout, 'N');
  assert.equal(northLayers[0].slot, 'offHand');
  assert.equal(northLayers[northLayers.length - 1].slot, 'accessory');

  // Re-equipping headgear restores exact derived Defense
  equipItem(loadout, stats, 'ranger_hood');
  assert.equal(getDerivedStat(stats, 'defense'), defWithHelm);
});

