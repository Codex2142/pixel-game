import type { InventorySlot, ItemId } from '../rules/inventory.ts';
import type {
  EquipmentLoadoutState,
  EquipmentSlotId,
  WeaponKind,
} from '../rules/equipment.ts';
import type { TargetAndCombatKeybindings } from '../rules/keybindings.ts';
import type { Direction8 } from '../rules/iso.ts';

export interface CheckpointUiEntry {
  id: string;
  name: string;
  subtitle: string;
  discovered: boolean;
  isCurrent: boolean;
}

export interface BossHudInfo {
  name: string;
  hp: number;
  maxHp: number;
}

export interface LockedTargetHudInfo {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  isElite: boolean;
  isManual: boolean;
  distance: number;
}

export interface HudSnapshot {
  level: number;
  xp: number;
  xpToNext: number;
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  attack: number;
  defense: number;
  critChancePct: number;
  facing: Direction8;
  inventory: InventorySlot[];
  inventoryCapacity: number;
  equipment: EquipmentLoadoutState;
  activeWeaponKind: WeaponKind;
  hasShield: boolean;
  combatState: {
    isAttacking: boolean;
    isReceivingDamage: boolean;
    isStaggered: boolean;
    isDodging: boolean;
    isBlocking: boolean;
    isSwitchingWeapon: boolean;
    canSwitchWeapon: boolean;
  };
  lockedTarget: LockedTargetHudInfo | null;
  keybindings: TargetAndCombatKeybindings;
  quickPotions: {
    healthCount: number;
    staminaCount: number;
  };
  arcaneCooldown: number;
  arcaneMaxCooldown: number;
  interactionPrompt: string | null;
  currentZone: {
    name: string;
    subtitle: string;
  };
  puzzleProgress: number;
  puzzleSolved: boolean;
  sentinelDefeated: boolean;
  bossInfo: BossHudInfo | null;
  checkpoints: CheckpointUiEntry[];
  staminaInsufficientPulse: number;
}

export interface AudioSettings {
  master: number;
  sfx: number;
  ambience: number;
}

export interface GameEvents {
  'hud:update': HudSnapshot;
  'ui:toast': {
    id: number;
    text: string;
    tone?: 'info' | 'success' | 'warning' | 'danger' | 'lore';
  };
  'ui:levelUp': { level: number; maxHp: number; maxStamina: number; attack: number };
  'ui:zoneBanner': { name: string; subtitle: string };
  'ui:openCheckpointModal': { currentId: string; checkpoints: CheckpointUiEntry[] };
  'ui:toggleInventoryModal': undefined;
  'ui:togglePauseModal': undefined;
  'ui:loreModal': { title: string; inscription: string } | null;

  // Commands from React UI -> Phaser Scene
  'cmd:useItem': { itemId: ItemId };
  'cmd:equipItem': { itemId: string };
  'cmd:unequipSlot': { slot: EquipmentSlotId };
  'cmd:switchWeapon': undefined;
  'cmd:toggleTargetLock': undefined;
  'cmd:switchTarget': { direction: 'left' | 'right' };
  'cmd:setKeybindings': TargetAndCombatKeybindings;
  'cmd:teleport': { checkpointId: string };
  'cmd:setModalOpen': { open: boolean };
  'cmd:setAudioSettings': AudioSettings;
  'cmd:setReduceShake': { reduceShake: boolean };
  'cmd:resetPrototype': undefined;
  'cmd:requestHudSync': undefined;
}

type Handler<T> = (payload: T) => void;

class TypedEventBus {
  private listeners = new Map<keyof GameEvents, Set<Handler<any>>>();

  on<K extends keyof GameEvents>(event: K, handler: Handler<GameEvents[K]>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
    return () => this.off(event, handler);
  }

  off<K extends keyof GameEvents>(event: K, handler: Handler<GameEvents[K]>): void {
    this.listeners.get(event)?.delete(handler);
  }

  emit<K extends keyof GameEvents>(event: K, payload: GameEvents[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const fn of set) {
      fn(payload);
    }
  }
}

export const eventBus = new TypedEventBus();
