import type { InventorySlot } from './inventory.ts';
import type { EquipmentSlotId } from './equipment.ts';
import type { TargetAndCombatKeybindings } from './keybindings.ts';

export const SAVE_VERSION = 1;
export const PRIMARY_SAVE_KEY = 'aethelgard_arpg_save_v1';
export const BACKUP_SAVE_KEY = 'aethelgard_arpg_save_v1.bak';

export interface SaveDataV1 {
  version: number;
  player: {
    level: number;
    xp: number;
    hp: number;
    stamina: number;
    baseMaxHp: number;
    baseMaxStamina: number;
    baseAttack: number;
    baseDefense: number;
  };
  inventory: InventorySlot[];
  equipment?: {
    equipped: Record<EquipmentSlotId, string | null>;
    storedShieldId: string | null;
    alternateWeaponId: string;
  };
  keybindings?: TargetAndCombatKeybindings;
  world: {
    discoveredCheckpoints: string[];
    lastCheckpointId: string;
    puzzleSolved: boolean;
    openedChests: string[];
    sentinelDefeated: boolean;
  };
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function isValidSaveData(obj: unknown): obj is SaveDataV1 {
  if (!obj || typeof obj !== 'object') return false;
  const d = obj as Record<string, unknown>;
  if (typeof d.version !== 'number' || d.version > SAVE_VERSION) return false;
  if (!d.player || typeof d.player !== 'object') return false;
  if (!d.world || typeof d.world !== 'object') return false;
  if (!Array.isArray(d.inventory)) return false;
  const p = d.player as Record<string, unknown>;
  return (
    typeof p.level === 'number' &&
    typeof p.xp === 'number' &&
    typeof p.hp === 'number' &&
    typeof p.stamina === 'number'
  );
}

export function saveGameState(storage: StorageLike, data: SaveDataV1): boolean {
  try {
    const serialized = JSON.stringify({ ...data, version: SAVE_VERSION });
    const existing = storage.getItem(PRIMARY_SAVE_KEY);
    if (existing && isValidJsonSave(existing)) {
      storage.setItem(BACKUP_SAVE_KEY, existing);
    }
    storage.setItem(PRIMARY_SAVE_KEY, serialized);
    return true;
  } catch {
    return false;
  }
}

function isValidJsonSave(raw: string): boolean {
  try {
    return isValidSaveData(JSON.parse(raw));
  } catch {
    return false;
  }
}

export function loadGameState(storage: StorageLike): SaveDataV1 | null {
  for (const key of [PRIMARY_SAVE_KEY, BACKUP_SAVE_KEY]) {
    try {
      const raw = storage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (isValidSaveData(parsed)) {
        return parsed;
      }
    } catch {
      // Try backup next
    }
  }
  return null;
}

export function clearGameState(storage: StorageLike): void {
  storage.removeItem(PRIMARY_SAVE_KEY);
  storage.removeItem(BACKUP_SAVE_KEY);
}
