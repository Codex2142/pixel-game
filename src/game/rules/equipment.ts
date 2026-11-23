import {
  addModifier,
  removeModifiersBySource,
  getDerivedStat,
  type PlayerStatsState,
  type StatModifier,
} from './stats.ts';

/**
 * Modular visual & gameplay equipment slots as required by Section 3:
 * - headgear
 * - chest
 * - legs
 * - gloves
 * - boots
 * - mainHand (dagger | greatsword)
 * - offHand (shield — only compatible with dagger!)
 * - accessory
 */
export type EquipmentSlotId =
  | 'headgear'
  | 'chest'
  | 'legs'
  | 'gloves'
  | 'boots'
  | 'mainHand'
  | 'offHand'
  | 'accessory';

export type WeaponKind = 'dagger' | 'greatsword';

export type EquipmentItemId =
  | 'ranger_hood'
  | 'knight_helm'
  | 'cobalt_surcoat'
  | 'steel_cuirass'
  | 'ranger_greaves'
  | ' leather_gloves'
  | 'steel_gauntlets'
  | 'wayfarer_boots'
  | 'iron_sabatons'
  | 'rondel_dagger'
  | 'aethelgard_greatsword'
  | 'iron_kite_shield'
  | 'gold_baldric_cloak';

export interface WeaponCombatProfile {
  weaponKind: WeaponKind;
  allowsShield: boolean;
  staminaCost: number;
  attackDuration: number;
  attackCooldown: number;
  switchDuration: number;
  reach: number;
  cleaveHalfAngleRad: number;
  staggerPower: number;
}

export const WEAPON_PROFILES: Record<WeaponKind, WeaponCombatProfile> = {
  dagger: {
    weaponKind: 'dagger',
    allowsShield: true,
    staminaCost: 14,
    attackDuration: 0.22,
    attackCooldown: 0.28,
    switchDuration: 0.3,
    reach: 58,
    cleaveHalfAngleRad: 1.05,
    staggerPower: 0.2,
  },
  greatsword: {
    weaponKind: 'greatsword',
    allowsShield: false,
    staminaCost: 26,
    attackDuration: 0.38,
    attackCooldown: 0.56,
    switchDuration: 0.34,
    reach: 84,
    cleaveHalfAngleRad: 1.55,
    staggerPower: 0.48,
  },
};

export interface EquipmentDefinition {
  id: string;
  name: string;
  slot: EquipmentSlotId;
  visualLayerKey: string; // Spritesheet key rendered by the modular PlayerRig
  icon: string;
  description: string;
  weaponKind?: WeaponKind;
  modifiers: Omit<StatModifier, 'id' | 'source'>[];
}

export const EQUIPMENT_CATALOG: Record<string, EquipmentDefinition> = {
  ranger_hood: {
    id: 'ranger_hood',
    name: 'Cobalt Ranger Hood',
    slot: 'headgear',
    visualLayerKey: 'layer-head-hood',
    icon: 'assets/icon-head-hood.png',
    description: 'Hooded cobalt mantle stitched with a silver knightly circlet (+10 Max HP, +2 DEF).',
    modifiers: [
      { stat: 'maxHp', kind: 'flat', value: 10 },
      { stat: 'defense', kind: 'flat', value: 2 },
    ],
  },
  knight_helm: {
    id: 'knight_helm',
    name: 'Vanguard Greathelm',
    slot: 'headgear',
    visualLayerKey: 'layer-head-helm',
    icon: 'assets/icon-head-helm.png',
    description: 'Forged steel visor helm with gilded crest (+22 Max HP, +5 DEF).',
    modifiers: [
      { stat: 'maxHp', kind: 'flat', value: 22 },
      { stat: 'defense', kind: 'flat', value: 5 },
    ],
  },
  cobalt_surcoat: {
    id: 'cobalt_surcoat',
    name: 'Wayfarer Cobalt Brigandine',
    slot: 'chest',
    visualLayerKey: 'layer-chest-surcoat',
    icon: 'assets/icon-chest-surcoat.png',
    description: 'Supple cobaltbrigandine over chainmail (+15 Max HP, +12 Max Stamina, +4 DEF).',
    modifiers: [
      { stat: 'maxHp', kind: 'flat', value: 15 },
      { stat: 'maxStamina', kind: 'flat', value: 12 },
      { stat: 'defense', kind: 'flat', value: 4 },
    ],
  },
  steel_cuirass: {
    id: 'steel_cuirass',
    name: 'Aethelgard Plate Cuirass',
    slot: 'chest',
    visualLayerKey: 'layer-chest-plate',
    icon: 'assets/icon-chest-plate.png',
    description: 'Fluted royal plate breastplate and pauldrons (+35 Max HP, +9 DEF).',
    modifiers: [
      { stat: 'maxHp', kind: 'flat', value: 35 },
      { stat: 'defense', kind: 'flat', value: 9 },
    ],
  },
  ranger_greaves: {
    id: 'ranger_greaves',
    name: 'Reinforced Tassets & Trousers',
    slot: 'legs',
    visualLayerKey: 'layer-legs-greaves',
    icon: 'assets/icon-legs-greaves.png',
    description: 'Quilted wool and riveted thigh plates (+10 Max Stamina, +3 DEF).',
    modifiers: [
      { stat: 'maxStamina', kind: 'flat', value: 10 },
      { stat: 'defense', kind: 'flat', value: 3 },
    ],
  },
  steel_gauntlets: {
    id: 'steel_gauntlets',
    name: 'Knightly Vambraces',
    slot: 'gloves',
    visualLayerKey: 'layer-gloves-gauntlets',
    icon: 'assets/icon-gloves-gauntlets.png',
    description: 'Articulated steel gauntlets that steady every strike (+3 ATK, +2 DEF).',
    modifiers: [
      { stat: 'attack', kind: 'flat', value: 3 },
      { stat: 'defense', kind: 'flat', value: 2 },
    ],
  },
  wayfarer_boots: {
    id: 'wayfarer_boots',
    name: 'Strider Leather Boots',
    slot: 'boots',
    visualLayerKey: 'layer-boots-leather',
    icon: 'assets/icon-boots-leather.png',
    description: 'Cushioned forest-strider boots (+15 Max Stamina, +2 DEF).',
    modifiers: [
      { stat: 'maxStamina', kind: 'flat', value: 15 },
      { stat: 'defense', kind: 'flat', value: 2 },
    ],
  },
  rondel_dagger: {
    id: 'rondel_dagger',
    name: "Knight's Rondel Dagger",
    slot: 'mainHand',
    visualLayerKey: 'layer-weapon-dagger',
    icon: 'assets/icon-weapon-dagger.png',
    weaponKind: 'dagger',
    description:
      'One-Handed Dagger — Rapid precision strikes (14 Stamina), +6 ATK, +12% Crit Chance. Compatible with Off-Hand Shield.',
    modifiers: [
      { stat: 'attack', kind: 'flat', value: 6 },
      { stat: 'critChance', kind: 'flat', value: 0.12 },
    ],
  },
  aethelgard_greatsword: {
    id: 'aethelgard_greatsword',
    name: 'Aethelgard Claymore (Greatsword)',
    slot: 'mainHand',
    visualLayerKey: 'layer-weapon-greatsword',
    icon: 'assets/icon-weapon-greatsword.png',
    weaponKind: 'greatsword',
    description:
      'Two-Handed Greatsword — Massive sweeping arcs (26 Stamina), +16 ATK, high stagger power. Cannot be used with a Shield.',
    modifiers: [{ stat: 'attack', kind: 'flat', value: 16 }],
  },
  iron_kite_shield: {
    id: 'iron_kite_shield',
    name: 'Heraldic Kite Shield',
    slot: 'offHand',
    visualLayerKey: 'layer-offhand-shield',
    icon: 'assets/icon-offhand-shield.png',
    description:
      'Off-Hand Shield — Steel-rimmed kite shield (+8 DEF, +20 Max HP). Enables Guard Blocking [Shift]. Requires One-Handed Dagger.',
    modifiers: [
      { stat: 'defense', kind: 'flat', value: 8 },
      { stat: 'maxHp', kind: 'flat', value: 20 },
    ],
  },
  gold_baldric_cloak: {
    id: 'gold_baldric_cloak',
    name: 'Wayfarer Cloak & Gold Baldric',
    slot: 'accessory',
    visualLayerKey: 'layer-accessory-cloak',
    icon: 'assets/icon-accessory-cloak.png',
    description: 'Embroidered cobalt travel cloak with gilded sword baldric (+10 Max Stamina, +5% Crit).',
    modifiers: [
      { stat: 'maxStamina', kind: 'flat', value: 10 },
      { stat: 'critChance', kind: 'flat', value: 0.05 },
    ],
  },
};

export interface EquipmentLoadoutState {
  equipped: Record<EquipmentSlotId, string | null>;
  ownedEquipmentIds: string[];
  storedShieldId: string | null; // Remembers off-hand shield when switching from Dagger -> Greatsword
  alternateWeaponId: string;     // The weapon waiting in quick-switch reserve
}

export interface CombatActionLocks {
  isAttacking: boolean;
  isReceivingDamage: boolean;
  isStaggered: boolean;
  isDodging: boolean;
  isBlocking: boolean;
  isSwitchingWeapon: boolean;
}

export function createInitialEquipmentState(): EquipmentLoadoutState {
  return {
    equipped: {
      headgear: 'ranger_hood',
      chest: 'cobalt_surcoat',
      legs: 'ranger_greaves',
      gloves: 'steel_gauntlets',
      boots: 'wayfarer_boots',
      mainHand: 'rondel_dagger',
      offHand: 'iron_kite_shield',
      accessory: 'gold_baldric_cloak',
    },
    ownedEquipmentIds: [
      'ranger_hood',
      'knight_helm',
      'cobalt_surcoat',
      'steel_cuirass',
      'ranger_greaves',
      'steel_gauntlets',
      'wayfarer_boots',
      'rondel_dagger',
      'aethelgard_greatsword',
      'iron_kite_shield',
      'gold_baldric_cloak',
    ],
    storedShieldId: 'iron_kite_shield',
    alternateWeaponId: 'aethelgard_greatsword',
  };
}

/**
 * Checks whether weapon switching (or equipment changing) is currently permitted
 * by the player's combat state (Section 2).
 */
export function canSwitchWeapon(locks: CombatActionLocks): { allowed: boolean; reason?: string } {
  if (locks.isAttacking) {
    return { allowed: false, reason: 'Cannot switch weapons while performing an attack.' };
  }
  if (locks.isReceivingDamage) {
    return { allowed: false, reason: 'Cannot switch weapons while recovering from damage.' };
  }
  if (locks.isStaggered) {
    return { allowed: false, reason: 'Cannot switch weapons while staggered.' };
  }
  if (locks.isDodging) {
    return { allowed: false, reason: 'Cannot switch weapons mid-dodge.' };
  }
  if (locks.isBlocking) {
    return { allowed: false, reason: 'Lower your shield before switching weapons.' };
  }
  if (locks.isSwitchingWeapon) {
    return { allowed: false, reason: 'Already switching weapons.' };
  }
  return { allowed: true };
}

/**
 * Rebuilds all equipment modifiers on the player's stats state and clamps current HP/Stamina
 * so unequipping/re-equipping never grants a free heal or invalid stats (`rpg` skill Pattern 1).
 */
export function syncEquipmentModifiers(
  loadout: EquipmentLoadoutState,
  stats: PlayerStatsState
): void {
  // Remove all existing equipment modifiers
  for (const slot of Object.keys(loadout.equipped) as EquipmentSlotId[]) {
    removeModifiersBySource(stats, `equip:${slot}`);
  }

  // Push modifiers for every currently active slot
  for (const [slot, itemId] of Object.entries(loadout.equipped) as [
    EquipmentSlotId,
    string | null
  ][]) {
    if (!itemId) continue;
    const def = EQUIPMENT_CATALOG[itemId];
    if (!def) continue;
    def.modifiers.forEach((mod, idx) => {
      addModifier(stats, {
        id: `equip:${slot}:${idx}`,
        source: `equip:${slot}`,
        stat: mod.stat,
        kind: mod.kind,
        value: mod.value,
      });
    });
  }

  // Clamp current HP & Stamina to derived max
  stats.hp = Math.min(stats.hp, getDerivedStat(stats, 'maxHp'));
  stats.stamina = Math.min(stats.stamina, getDerivedStat(stats, 'maxStamina'));
}

export function getActiveWeaponKind(loadout: EquipmentLoadoutState): WeaponKind {
  const mainId = loadout.equipped.mainHand;
  const def = mainId ? EQUIPMENT_CATALOG[mainId] : null;
  return def?.weaponKind ?? 'dagger';
}

export function getActiveWeaponProfile(loadout: EquipmentLoadoutState): WeaponCombatProfile {
  return WEAPON_PROFILES[getActiveWeaponKind(loadout)];
}

export function hasActiveShield(loadout: EquipmentLoadoutState): boolean {
  return (
    getActiveWeaponKind(loadout) === 'dagger' &&
    loadout.equipped.offHand !== null &&
    EQUIPMENT_CATALOG[loadout.equipped.offHand] !== undefined
  );
}

export interface EquipOperationResult {
  success: boolean;
  message: string;
  shieldAutoStored?: boolean;
  shieldAutoRestored?: boolean;
  switchDuration: number;
}

/**
 * Equips an item into its designated slot, enforcing weapon-shield compatibility rules
 * and recalculating derived player attributes immediately.
 */
export function equipItem(
  loadout: EquipmentLoadoutState,
  stats: PlayerStatsState,
  itemId: string,
  locks?: CombatActionLocks
): EquipOperationResult {
  const def = EQUIPMENT_CATALOG[itemId];
  if (!def || !loadout.ownedEquipmentIds.includes(itemId)) {
    return {
      success: false,
      message: 'Equipment item not found in inventory.',
      switchDuration: 0,
    };
  }

  if (locks && (def.slot === 'mainHand' || def.slot === 'offHand')) {
    const check = canSwitchWeapon(locks);
    if (!check.allowed) {
      return {
        success: false,
        message: check.reason!,
        switchDuration: 0,
      };
    }
  }

  // Rule: Off-hand shield cannot be equipped while wielding a Two-Handed Greatsword
  if (def.slot === 'offHand' && getActiveWeaponKind(loadout) === 'greatsword') {
    return {
      success: false,
      message: 'Greatsword is two-handed and does not support off-hand shields. Switch to Dagger first.',
      switchDuration: 0,
    };
  }

  let shieldAutoStored = false;
  let shieldAutoRestored = false;

  if (def.slot === 'mainHand') {
    const prevMain = loadout.equipped.mainHand;
    if (prevMain && prevMain !== itemId) {
      loadout.alternateWeaponId = prevMain;
    }
    loadout.equipped.mainHand = itemId;

    if (def.weaponKind === 'greatsword') {
      // Automatically store any currently equipped shield
      if (loadout.equipped.offHand) {
        loadout.storedShieldId = loadout.equipped.offHand;
        loadout.equipped.offHand = null;
        shieldAutoStored = true;
      }
    } else if (def.weaponKind === 'dagger') {
      // Automatically restore stored shield if still owned in inventory
      if (
        !loadout.equipped.offHand &&
        loadout.storedShieldId &&
        loadout.ownedEquipmentIds.includes(loadout.storedShieldId)
      ) {
        loadout.equipped.offHand = loadout.storedShieldId;
        shieldAutoRestored = true;
      }
    }
  } else if (def.slot === 'offHand') {
    loadout.equipped.offHand = itemId;
    loadout.storedShieldId = itemId;
  } else {
    loadout.equipped[def.slot] = itemId;
  }

  syncEquipmentModifiers(loadout, stats);

  const profile = getActiveWeaponProfile(loadout);
  const extraMsg = shieldAutoStored
    ? ' (Heraldic Shield automatically stored)'
    : shieldAutoRestored
    ? ' (Heraldic Shield automatically re-equipped)'
    : '';

  return {
    success: true,
    message: `Equipped ${def.name}${extraMsg}.`,
    shieldAutoStored,
    shieldAutoRestored,
    switchDuration: def.slot === 'mainHand' ? profile.switchDuration : 0,
  };
}

/**
 * Unequips an item slot (restoring the base character visual layer for armor slots,
 * and recalculating derived attributes). Main-hand weapon swaps between Dagger and Greatsword.
 */
export function unequipSlot(
  loadout: EquipmentLoadoutState,
  stats: PlayerStatsState,
  slot: EquipmentSlotId,
  locks?: CombatActionLocks
): EquipOperationResult {
  if (slot === 'mainHand') {
    return {
      success: false,
      message: 'A primary weapon must remain equipped. Switch between Dagger and Greatsword instead.',
      switchDuration: 0,
    };
  }
  if (locks && slot === 'offHand') {
    const check = canSwitchWeapon(locks);
    if (!check.allowed) {
      return { success: false, message: check.reason!, switchDuration: 0 };
    }
  }

  const prevId = loadout.equipped[slot];
  if (!prevId) {
    return { success: false, message: 'Slot is already empty.', switchDuration: 0 };
  }

  const prevDef = EQUIPMENT_CATALOG[prevId];
  loadout.equipped[slot] = null;
  if (slot === 'offHand') {
    loadout.storedShieldId = null;
  }
  syncEquipmentModifiers(loadout, stats);

  return {
    success: true,
    message: `Unequipped ${prevDef?.name ?? slot}.`,
    switchDuration: 0,
  };
}

/**
 * Performs conditional weapon switching between the active main-hand weapon (Dagger vs Greatsword).
 */
export function switchPrimaryWeapon(
  loadout: EquipmentLoadoutState,
  stats: PlayerStatsState,
  locks: CombatActionLocks
): EquipOperationResult {
  const check = canSwitchWeapon(locks);
  if (!check.allowed) {
    return {
      success: false,
      message: check.reason!,
      switchDuration: 0,
    };
  }

  const currentWeapon = loadout.equipped.mainHand;
  const targetWeapon =
    currentWeapon === 'rondel_dagger' ? 'aethelgard_greatsword' : 'rondel_dagger';

  return equipItem(loadout, stats, targetWeapon, locks);
}

/**
 * Returns the ordered visual layer texture keys for a given 8-direction so occlusion is always accurate:
 * - Facing N, NE, NW: weapon/shield held in front of body are occluded behind the torso, while cloak is in front.
 * - Facing S, SE, SW, E, W: cloak renders behind torso, armor layers render on torso, weapon & shield render on top.
 */
export interface OrderedVisualLayer {
  slot: EquipmentSlotId | 'body';
  textureKey: string;
}

export function getOrderedVisualLayers(
  loadout: EquipmentLoadoutState,
  direction: 'S' | 'SW' | 'W' | 'NW' | 'N' | 'NE' | 'E' | 'SE'
): OrderedVisualLayer[] {
  const layers: OrderedVisualLayer[] = [];
  const isNorthFacing = direction === 'N' || direction === 'NE' || direction === 'NW';

  const pushSlot = (slot: EquipmentSlotId) => {
    // Shield only renders when dagger is equipped and shield is equipped
    if (slot === 'offHand' && !hasActiveShield(loadout)) return;
    const itemId = loadout.equipped[slot];
    if (!itemId) return;
    const def = EQUIPMENT_CATALOG[itemId];
    if (def) {
      layers.push({ slot, textureKey: def.visualLayerKey });
    }
  };

  if (isNorthFacing) {
    // When facing away from camera, weapons & shield sit in front of the character's chest (behind the back from camera view)
    pushSlot('offHand');
    pushSlot('mainHand');
    layers.push({ slot: 'body', textureKey: 'layer-body-base' });
    pushSlot('legs');
    pushSlot('boots');
    pushSlot('chest');
    pushSlot('gloves');
    pushSlot('headgear');
    pushSlot('accessory'); // Cloak drapes over the back closest to camera
  } else {
    // Facing toward or side to camera: cloak behind body, armor over body, shield & weapon in foreground
    pushSlot('accessory');
    layers.push({ slot: 'body', textureKey: 'layer-body-base' });
    pushSlot('legs');
    pushSlot('boots');
    pushSlot('chest');
    pushSlot('gloves');
    pushSlot('headgear');
    if (direction === 'E' || direction === 'SE') {
      pushSlot('offHand');
      pushSlot('mainHand');
    } else {
      pushSlot('mainHand');
      pushSlot('offHand');
    }
  }

  return layers;
}
