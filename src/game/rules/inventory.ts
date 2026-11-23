import { type PlayerStatsState, getDerivedStat, healPlayer } from './stats.ts';

export type ItemId =
  | 'health_potion'
  | 'stamina_potion'
  | 'wayfarer_seal'
  | 'sunstone_relic'
  | 'sentinel_core';

export type ItemCategory = 'consumable' | 'quest';

export interface ItemDefinition {
  id: ItemId;
  name: string;
  category: ItemCategory;
  icon: string;
  description: string;
  healHp?: number;
  restoreStamina?: number;
  maxStack: number;
}

export const ITEM_CATALOG: Record<ItemId, ItemDefinition> = {
  health_potion: {
    id: 'health_potion',
    name: 'Health Potion',
    category: 'consumable',
    icon: '/assets/icon-hp-potion.png',
    description: 'Alchemical crimson draught brewed from wild sunberries. Restores 50 Health immediately.',
    healHp: 50,
    maxStack: 10,
  },
  stamina_potion: {
    id: 'stamina_potion',
    name: 'Stamina Potion',
    category: 'consumable',
    icon: '/assets/icon-stamina-potion.png',
    description: 'Brisk emerald tonic infused with whisper-mint. Restores 65 Stamina immediately.',
    restoreStamina: 65,
    maxStack: 10,
  },
  wayfarer_seal: {
    id: 'wayfarer_seal',
    name: "Wayfarer's Seal",
    category: 'quest',
    icon: '/assets/icon-seal.png',
    description:
      'Quest Item — An engraved knightly medallion that resonates with the ancient Waystone Shrines of Aethelgard, allowing instantaneous travel between discovered shrines.',
    maxStack: 1,
  },
  sunstone_relic: {
    id: 'sunstone_relic',
    name: 'Sunstone Relic',
    category: 'quest',
    icon: '/assets/icon-sunstone.png',
    description:
      'Quest Item — A radiant celestial crest recovered from the Sunken Temple Hidden Vault. Proof of mastery over the ancient Moon-Sun-Star trials.',
    maxStack: 1,
  },
  sentinel_core: {
    id: 'sentinel_core',
    name: "Sentinel's Amber Core",
    category: 'quest',
    icon: '/assets/icon-core.png',
    description:
      'Quest Item — The still-warm runic heart of the Moss-Stone Sentinel guarding the Sealed Dungeon Gate.',
    maxStack: 1,
  },
};

export interface InventorySlot {
  itemId: ItemId;
  quantity: number;
}

export interface InventoryState {
  slots: InventorySlot[];
  capacity: number;
}

export function createInitialInventory(): InventoryState {
  return {
    capacity: 12,
    slots: [
      { itemId: 'health_potion', quantity: 3 },
      { itemId: 'stamina_potion', quantity: 2 },
      { itemId: 'wayfarer_seal', quantity: 1 },
    ],
  };
}

export function getItemCount(inv: InventoryState, itemId: ItemId): number {
  const slot = inv.slots.find((s) => s.itemId === itemId);
  return slot ? slot.quantity : 0;
}

export function addItem(inv: InventoryState, itemId: ItemId, qty = 1): boolean {
  if (qty <= 0) return false;
  const def = ITEM_CATALOG[itemId];
  const existing = inv.slots.find((s) => s.itemId === itemId);
  if (existing) {
    existing.quantity = Math.min(def.maxStack, existing.quantity + qty);
    return true;
  }
  if (inv.slots.length >= inv.capacity) {
    return false;
  }
  inv.slots.push({ itemId, quantity: Math.min(def.maxStack, qty) });
  return true;
}

export interface UseItemResult {
  success: boolean;
  message: string;
  hpDelta: number;
  staminaDelta: number;
}

export function useInventoryItem(
  inv: InventoryState,
  stats: PlayerStatsState,
  itemId: ItemId
): UseItemResult {
  const slotIndex = inv.slots.findIndex((s) => s.itemId === itemId);
  if (slotIndex === -1 || inv.slots[slotIndex].quantity <= 0) {
    return {
      success: false,
      message: 'No remaining items of that type.',
      hpDelta: 0,
      staminaDelta: 0,
    };
  }
  const def = ITEM_CATALOG[itemId];
  if (def.category === 'quest') {
    return {
      success: false,
      message: `${def.name} is a Quest Item and cannot be consumed.`,
      hpDelta: 0,
      staminaDelta: 0,
    };
  }

  const prevHp = stats.hp;
  const prevStam = stats.stamina;
  const maxHp = getDerivedStat(stats, 'maxHp');
  const maxStam = getDerivedStat(stats, 'maxStamina');

  if (def.healHp && prevHp >= maxHp && !def.restoreStamina) {
    return {
      success: false,
      message: 'Health is already full.',
      hpDelta: 0,
      staminaDelta: 0,
    };
  }
  if (def.restoreStamina && prevStam >= maxStam && !def.healHp) {
    return {
      success: false,
      message: 'Stamina is already full.',
      hpDelta: 0,
      staminaDelta: 0,
    };
  }

  healPlayer(stats, def.healHp ?? 0, def.restoreStamina ?? 0);
  const hpDelta = Math.round(stats.hp - prevHp);
  const staminaDelta = Math.round(stats.stamina - prevStam);

  inv.slots[slotIndex].quantity -= 1;
  if (inv.slots[slotIndex].quantity <= 0) {
    inv.slots.splice(slotIndex, 1);
  }

  return {
    success: true,
    message: `Used ${def.name} (+${hpDelta || staminaDelta} ${hpDelta ? 'HP' : 'Stamina'}).`,
    hpDelta,
    staminaDelta,
  };
}
