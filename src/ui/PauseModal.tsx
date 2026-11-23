import React from 'react';
import { eventBus, type AudioSettings } from '../game/bridge/EventBus.ts';
import {
  ALLOWED_REBIND_KEYS,
  type TargetAndCombatKeybindings,
} from '../game/rules/keybindings.ts';

interface PauseModalProps {
  audio: AudioSettings;
  reduceShake: boolean;
  keybindings: TargetAndCombatKeybindings;
  onChangeAudio: (next: AudioSettings) => void;
  onToggleReduceShake: (next: boolean) => void;
  onClose: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  audio,
  reduceShake,
  keybindings,
  onChangeAudio,
  onToggleReduceShake,
  onClose,
}) => {
  const updateSlider = (key: keyof AudioSettings, val: number) => {
    const next = { ...audio, [key]: val };
    onChangeAudio(next);
    eventBus.emit('cmd:setAudioSettings', next);
  };

  const updateKeybind = (
    action: keyof TargetAndCombatKeybindings,
    newKey: string
  ) => {
    const next = { ...keybindings, [action]: newKey };
    eventBus.emit('cmd:setKeybindings', next);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card"
        style={{ maxWidth: '580px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 className="modal-title">GAME PAUSED & CONTROLS</h2>
          <button className="modal-close-btn" onClick={onClose}>
            [ESC] RESUME
          </button>
        </div>

        {/* Configurable Target-Lock & Combat Keybindings */}
        <div
          style={{
            background: 'rgba(14, 16, 24, 0.85)',
            border: '1px solid #4c5368',
            padding: '10px 12px',
            fontSize: '10px',
            marginBottom: '12px',
          }}
        >
          <div style={{ color: '#f5d27a', marginBottom: '8px' }}>
            CONFIGURABLE TARGET-LOCK & COMBAT KEYBINDINGS
          </div>
          {(
            [
              ['toggleLockKey', 'Toggle Hybrid Target Lock'],
              ['switchTargetLeftKey', 'Switch Target (Left / Prev)'],
              ['switchTargetRightKey', 'Switch Target (Right / Next)'],
              ['switchWeaponKey', 'Conditional Weapon Switch (Dagger / Greatsword)'],
              ['blockKey', 'Shield Guard Block (Hold with Dagger + Shield)'],
            ] as [keyof TargetAndCombatKeybindings, string][]
          ).map(([field, label]) => (
            <div
              key={field}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '6px',
              }}
            >
              <span>{label}</span>
              <select
                value={keybindings[field]}
                onChange={(e) => updateKeybind(field, e.target.value)}
                style={{
                  background: '#1f2231',
                  color: '#f5d27a',
                  border: '1px solid #c89d4c',
                  fontFamily: 'Silkscreen, monospace',
                  fontSize: '9px',
                  padding: '3px 6px',
                }}
              >
                {ALLOWED_REBIND_KEYS.map((k) => (
                  <option key={k} value={k}>
                    [{k}]
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        {/* Core Controls Reference */}
        <div
          style={{
            background: 'rgba(14, 16, 24, 0.85)',
            border: '1px solid #4c5368',
            padding: '8px 12px',
            fontSize: '9px',
            lineHeight: 1.6,
            marginBottom: '12px',
          }}
        >
          <div>
            • [W/A/S/D] 8-Way Isometric Move • [Left-Click / J] Attack • [Right-Click / Q] Arcane Bolt
          </div>
          <div>
            • [Space] Dodge Roll • [E] Interact • [1 / 2] Potions • [I] Modular Gear & Bag
          </div>
        </div>

        {/* Audio & Accessibility */}
        <div style={{ marginBottom: '14px' }}>
          <div className="slider-row">
            <span>Master Volume ({Math.round(audio.master * 100)}%)</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={audio.master}
              onChange={(e) => updateSlider('master', Number(e.target.value))}
            />
          </div>
          <div className="slider-row">
            <span>Combat & UI SFX ({Math.round(audio.sfx * 100)}%)</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={audio.sfx}
              onChange={(e) => updateSlider('sfx', Number(e.target.value))}
            />
          </div>
          <div className="slider-row">
            <span>Forest Ambience ({Math.round(audio.ambience * 100)}%)</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={audio.ambience}
              onChange={(e) => updateSlider('ambience', Number(e.target.value))}
            />
          </div>
          <div className="slider-row">
            <span>Reduce Camera Shake</span>
            <input
              type="checkbox"
              checked={reduceShake}
              onChange={(e) => {
                onToggleReduceShake(e.target.checked);
                eventBus.emit('cmd:setReduceShake', {
                  reduceShake: e.target.checked,
                });
              }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="rpg-btn" onClick={onClose}>
            RESUME ADVENTURE
          </button>
          <button
            className="rpg-btn danger"
            onClick={() => {
              eventBus.emit('cmd:resetPrototype', undefined);
              onClose();
            }}
          >
            RESET PROTOTYPE SAVE
          </button>
        </div>
      </div>
    </div>
  );
};
