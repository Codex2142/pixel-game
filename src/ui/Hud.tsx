import React from 'react';
import { eventBus, type HudSnapshot } from '../game/bridge/EventBus.ts';
import { EQUIPMENT_CATALOG } from '../game/rules/equipment.ts';

interface HudProps {
  hud: HudSnapshot;
  toast: { id: number; text: string; tone?: string } | null;
  onOpenInventory: () => void;
  onOpenPause: () => void;
}

export const Hud: React.FC<HudProps> = ({
  hud,
  toast,
  onOpenInventory,
  onOpenPause,
}) => {
  const hpPct = Math.min(100, Math.max(0, (hud.hp / Math.max(1, hud.maxHp)) * 100));
  const stamPct = Math.min(100, Math.max(0, (hud.stamina / Math.max(1, hud.maxStamina)) * 100));
  const xpPct = Math.min(100, Math.max(0, (hud.xp / Math.max(1, hud.xpToNext)) * 100));
  const isStamFlashing = Date.now() - hud.staminaInsufficientPulse < 750;

  const mainWeaponId = hud.equipment.equipped.mainHand ?? 'rondel_dagger';
  const mainWeaponDef = EQUIPMENT_CATALOG[mainWeaponId] ?? EQUIPMENT_CATALOG.rondel_dagger;
  const offhandId = hud.equipment.equipped.offHand;
  const offhandDef = offhandId ? EQUIPMENT_CATALOG[offhandId] : null;

  return (
    <div className="hud-layer">
      {/* TOP BAR */}
      <div className="hud-top-row">
        {/* Protagonist Status Panel */}
        <div className="status-panel">
          <div className="level-crest" title={`Facing Direction: ${hud.facing}`}>
            <span className="level-crest-label">LV.{hud.level}</span>
            <span className="level-crest-num">{hud.facing}</span>
          </div>

          <div className="bars-column">
            <div className="hero-title-row">
              <span>SIR ALDRIC</span>
              <span className="hero-stats-mini">
                ATK {hud.attack} • DEF {hud.defense} • CRIT {hud.critChancePct}%
              </span>
            </div>

            {/* Health Bar */}
            <div className="resource-bar" title="Health Points">
              <div className="resource-fill hp" style={{ width: `${hpPct}%` }} />
              <div className="resource-text">
                <span>HP</span>
                <span>
                  {hud.hp} / {hud.maxHp}
                </span>
              </div>
            </div>

            {/* Stamina Bar */}
            <div
              className={`resource-bar ${isStamFlashing ? 'stamina-low-flash' : ''}`}
              title="Stamina (consumed by Attack, Dodge, Block & Arcane Bolt)"
            >
              <div className="resource-fill stamina" style={{ width: `${stamPct}%` }} />
              <div className="resource-text">
                <span>
                  STAM{' '}
                  {hud.combatState.isBlocking
                    ? '[GUARD]'
                    : hud.combatState.isStaggered
                    ? '[STAGGERED!]'
                    : ''}
                </span>
                <span>
                  {hud.stamina} / {hud.maxStamina}
                </span>
              </div>
            </div>

            {/* Experience Bar */}
            <div className="resource-bar xp-bar" title="Experience to Next Level">
              <div className="resource-fill xp" style={{ width: `${xpPct}%` }} />
              <div className="resource-text" style={{ fontSize: '7px' }}>
                <span>EXP</span>
                <span>
                  {hud.xp}/{hud.xpToNext}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Center Zone Indicator, Target-Lock Readout & Elite Boss Health Bar */}
        <div className="hud-center-stack">
          <div className="zone-pill">
            <div className="zone-pill-name">{hud.currentZone.name}</div>
            <div className="zone-pill-sub">{hud.currentZone.subtitle}</div>
          </div>

          {/* Hybrid Target-Lock Banner */}
          {hud.lockedTarget && (
            <div
              className="boss-bar-frame"
              style={{
                width: '320px',
                borderColor: hud.lockedTarget.isManual ? '#ffd859' : '#54e8ff',
                pointerEvents: 'auto',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '9px',
                  marginBottom: '4px',
                  color: hud.lockedTarget.isManual ? '#ffd859' : '#7ee8fa',
                }}
              >
                <span>
                  {hud.lockedTarget.isManual ? '[MANUAL LOCK]' : '[AUTO LOCK]'}{' '}
                  {hud.lockedTarget.name}
                </span>
                <span>{hud.lockedTarget.distance}m</span>
              </div>
              <div className="resource-bar">
                <div
                  className="resource-fill hp"
                  style={{
                    width: `${Math.max(
                      0,
                      (hud.lockedTarget.hp / Math.max(1, hud.lockedTarget.maxHp)) * 100
                    )}%`,
                  }}
                />
                <div className="resource-text">
                  <span>TARGET HP</span>
                  <span>
                    {hud.lockedTarget.hp} / {hud.lockedTarget.maxHp}
                  </span>
                </div>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginTop: '5px',
                  gap: '4px',
                }}
              >
                <button
                  className="hud-menu-btn"
                  style={{ flex: 1, padding: '3px 6px', fontSize: '8px' }}
                  onClick={() =>
                    eventBus.emit('cmd:switchTarget', { direction: 'left' })
                  }
                >
                  [{hud.keybindings.switchTargetLeftKey}] PREV
                </button>
                <button
                  className="hud-menu-btn"
                  style={{ flex: 1, padding: '3px 6px', fontSize: '8px' }}
                  onClick={() =>
                    eventBus.emit('cmd:toggleTargetLock', undefined)
                  }
                >
                  [{hud.keybindings.toggleLockKey}] UNLOCK
                </button>
                <button
                  className="hud-menu-btn"
                  style={{ flex: 1, padding: '3px 6px', fontSize: '8px' }}
                  onClick={() =>
                    eventBus.emit('cmd:switchTarget', { direction: 'right' })
                  }
                >
                  [{hud.keybindings.switchTargetRightKey}] NEXT
                </button>
              </div>
            </div>
          )}

          {hud.bossInfo && !hud.lockedTarget && (
            <div className="boss-bar-frame">
              <div className="boss-bar-title">{hud.bossInfo.name}</div>
              <div className="resource-bar">
                <div
                  className="resource-fill hp"
                  style={{
                    width: `${Math.max(
                      0,
                      (hud.bossInfo.hp / hud.bossInfo.maxHp) * 100
                    )}%`,
                  }}
                />
                <div className="resource-text">
                  <span>ELITE</span>
                  <span>
                    {hud.bossInfo.hp} / {hud.bossInfo.maxHp}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Top-Right Expedition Objectives */}
        <div className="quest-tracker">
          <div className="quest-tracker-header">ENCHANTED FOREST OBJECTIVES</div>
          <div
            className={`quest-step ${
              hud.checkpoints.filter((c) => c.discovered).length >= 2 ? 'done' : ''
            }`}
          >
            • Waystones: {hud.checkpoints.filter((c) => c.discovered).length}/2
          </div>
          <div className={`quest-step ${hud.puzzleSolved ? 'done' : ''}`}>
            • Temple Rune Trial: {hud.puzzleSolved ? 'Unsealed' : `${hud.puzzleProgress}/3`}
          </div>
          <div className={`quest-step ${hud.sentinelDefeated ? 'done' : ''}`}>
            • Moss-Stone Sentinel: {hud.sentinelDefeated ? 'Vanquished' : 'Guarding Gate'}
          </div>
        </div>
      </div>

      {/* BOTTOM BAR */}
      <div className="hud-bottom-area">
        {hud.interactionPrompt && (
          <div className="interaction-prompt">{hud.interactionPrompt}</div>
        )}

        {toast && (
          <div className={`toast-banner ${toast.tone ?? 'info'}`}>{toast.text}</div>
        )}

        <div className="quickbar-row">
          {/* Active Main-Hand Weapon & Conditional Switch Button */}
          <div
            className="quick-slot"
            style={{
              width: '56px',
              borderColor: hud.combatState.canSwitchWeapon ? '#c89d4c' : '#6e3434',
              opacity: hud.combatState.canSwitchWeapon ? 1 : 0.6,
            }}
            title={`[${hud.keybindings.switchWeaponKey}] Switch Weapon (${mainWeaponDef.name})`}
            onClick={() => eventBus.emit('cmd:switchWeapon', undefined)}
          >
            <span className="quick-key">{hud.keybindings.switchWeaponKey}</span>
            <img src={mainWeaponDef.icon} alt={mainWeaponDef.name} />
            <span className="quick-qty" style={{ fontSize: '7px' }}>
              {hud.activeWeaponKind === 'greatsword' ? '2H' : '1H'}
            </span>
            {hud.combatState.isSwitchingWeapon && (
              <div className="cooldown-overlay">SWAP</div>
            )}
          </div>

          {/* Off-Hand Shield Slot (Active only when Dagger + Shield equipped) */}
          <div
            className="quick-slot"
            style={{
              opacity: hud.hasShield ? 1 : 0.38,
              borderColor: hud.combatState.isBlocking ? '#54e8ff' : undefined,
            }}
            title={
              hud.hasShield
                ? `[Hold ${hud.keybindings.blockKey}] Guard Block (${offhandDef?.name})`
                : hud.activeWeaponKind === 'greatsword'
                ? 'Shield Stored (2H Greatsword Active)'
                : 'No Off-Hand Shield Equipped'
            }
          >
            <span className="quick-key">{hud.keybindings.blockKey}</span>
            <img
              src={offhandDef?.icon ?? 'assets/icon-offhand-shield.png'}
              alt="Off-Hand Shield"
            />
            <span className="quick-qty" style={{ fontSize: '7px' }}>
              {hud.hasShield ? 'SHLD' : 'OFF'}
            </span>
          </div>

          <div className="quickbar-divider" />

          {/* Quick Slot 1: Health Potion */}
          <div
            className="quick-slot"
            title="[1] Use Health Potion (+50 HP)"
            onClick={() => eventBus.emit('cmd:useItem', { itemId: 'health_potion' })}
          >
            <span className="quick-key">1</span>
            <img src="assets/icon-hp-potion.png" alt="Health Potion" />
            <span className="quick-qty">{hud.quickPotions.healthCount}</span>
          </div>

          {/* Quick Slot 2: Stamina Potion */}
          <div
            className="quick-slot"
            title="[2] Use Stamina Potion (+65 Stamina)"
            onClick={() => eventBus.emit('cmd:useItem', { itemId: 'stamina_potion' })}
          >
            <span className="quick-key">2</span>
            <img src="assets/icon-stamina-potion.png" alt="Stamina Potion" />
            <span className="quick-qty">{hud.quickPotions.staminaCount}</span>
          </div>

          {/* Arcane Bolt Spell Indicator */}
          <div
            className="quick-slot"
            title="[Right-Click / Q] Arcane Bolt (24 Stamina, 3.5s Cooldown)"
          >
            <span className="quick-key">Q</span>
            <img src="assets/icon-arcane.png" alt="Arcane Bolt" />
            {hud.arcaneCooldown > 0 && (
              <div className="cooldown-overlay">{hud.arcaneCooldown}s</div>
            )}
          </div>

          {/* Target Lock Quick Toggle */}
          <div
            className="quick-slot"
            style={{
              borderColor: hud.lockedTarget ? '#54e8ff' : undefined,
            }}
            title={`[${hud.keybindings.toggleLockKey}] Toggle Hybrid Target Lock`}
            onClick={() => eventBus.emit('cmd:toggleTargetLock', undefined)}
          >
            <span className="quick-key">{hud.keybindings.toggleLockKey}</span>
            <span style={{ fontSize: '9px', color: hud.lockedTarget ? '#54e8ff' : '#a6adbf' }}>
              {hud.lockedTarget ? 'LOCK' : 'AIM'}
            </span>
          </div>

          <div className="quickbar-divider" />

          <button className="hud-menu-btn" onClick={onOpenInventory}>
            [I] GEAR & BAG
          </button>
          <button className="hud-menu-btn" onClick={onOpenPause}>
            [ESC] MENU
          </button>
        </div>
      </div>
    </div>
  );
};
