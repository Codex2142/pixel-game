export interface TargetAndCombatKeybindings {
  toggleLockKey: string;       // Default: 'TAB' (or 'T')
  switchTargetLeftKey: string; // Default: 'C'
  switchTargetRightKey: string;// Default: 'V'
  switchWeaponKey: string;     // Default: 'X'
  blockKey: string;            // Default: 'SHIFT'
}

export const DEFAULT_KEYBINDINGS: TargetAndCombatKeybindings = {
  toggleLockKey: 'T',
  switchTargetLeftKey: 'C',
  switchTargetRightKey: 'V',
  switchWeaponKey: 'X',
  blockKey: 'SHIFT',
};

export const ALLOWED_REBIND_KEYS = [
  'T',
  'TAB',
  'C',
  'V',
  'X',
  'Z',
  'F',
  'G',
  'R',
  'B',
  'SHIFT',
] as const;

export function validateKeybindings(
  candidate: Partial<TargetAndCombatKeybindings>
): TargetAndCombatKeybindings {
  const merged: TargetAndCombatKeybindings = {
    ...DEFAULT_KEYBINDINGS,
    ...candidate,
  };
  // Normalize uppercase
  for (const k of Object.keys(merged) as (keyof TargetAndCombatKeybindings)[]) {
    merged[k] = merged[k].toUpperCase();
  }
  return merged;
}
