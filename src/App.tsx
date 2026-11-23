import React, { useEffect, useRef, useState } from 'react';
import type Phaser from 'phaser';
import { createPhaserGame } from './game/createGame.ts';
import {
  eventBus,
  type AudioSettings,
  type HudSnapshot,
} from './game/bridge/EventBus.ts';
import { createInitialEquipmentState } from './game/rules/equipment.ts';
import { DEFAULT_KEYBINDINGS } from './game/rules/keybindings.ts';
import { Hud } from './ui/Hud.tsx';
import { InventoryModal } from './ui/InventoryModal.tsx';
import { CheckpointModal } from './ui/CheckpointModal.tsx';
import { PauseModal } from './ui/PauseModal.tsx';
import { LoreModal } from './ui/LoreModal.tsx';

type ActiveModal = 'none' | 'inventory' | 'checkpoint' | 'pause' | 'lore';

const INITIAL_HUD: HudSnapshot = {
  level: 1,
  xp: 0,
  xpToNext: 80,
  hp: 155,
  maxHp: 155,
  stamina: 147,
  maxStamina: 147,
  attack: 27,
  defense: 29,
  critChancePct: 27,
  facing: 'SE',
  inventory: [],
  inventoryCapacity: 12,
  equipment: createInitialEquipmentState(),
  activeWeaponKind: 'dagger',
  hasShield: true,
  combatState: {
    isAttacking: false,
    isReceivingDamage: false,
    isStaggered: false,
    isDodging: false,
    isBlocking: false,
    isSwitchingWeapon: false,
    canSwitchWeapon: true,
  },
  lockedTarget: null,
  keybindings: { ...DEFAULT_KEYBINDINGS },
  quickPotions: { healthCount: 3, staminaCount: 2 },
  arcaneCooldown: 0,
  arcaneMaxCooldown: 3.5,
  interactionPrompt: null,
  currentZone: {
    name: 'Sunlit Glade',
    subtitle: 'Western Sanctuary of Aethelgard',
  },
  puzzleProgress: 0,
  puzzleSolved: false,
  sentinelDefeated: false,
  bossInfo: null,
  checkpoints: [],
  staminaInsufficientPulse: 0,
};

export const App: React.FC = () => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [modal, setModal] = useState<ActiveModal>('none');
  const [loreData, setLoreData] = useState<{ title: string; inscription: string } | null>(null);
  const [toast, setToast] = useState<{ id: number; text: string; tone?: string } | null>(null);
  const [audio, setAudio] = useState<AudioSettings>({
    master: 0.75,
    sfx: 0.85,
    ambience: 0.55,
  });
  const [reduceShake, setReduceShake] = useState(false);

  useEffect(() => {
    if (!hostRef.current || gameRef.current) return;
    const game = createPhaserGame(hostRef.current);
    gameRef.current = game;

    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
  }, []);

  useEffect(() => {
    const unsubs = [
      eventBus.on('hud:update', (snapshot) => {
        setHud(snapshot);
      }),
      eventBus.on('ui:toast', (msg) => {
        setToast(msg);
      }),
      eventBus.on('ui:openCheckpointModal', () => {
        setModal('checkpoint');
      }),
      eventBus.on('ui:toggleInventoryModal', () => {
        setModal((prev) => (prev === 'inventory' ? 'none' : 'inventory'));
      }),
      eventBus.on('ui:togglePauseModal', () => {
        setModal((prev) => (prev !== 'none' ? 'none' : 'pause'));
      }),
      eventBus.on('ui:loreModal', (payload) => {
        if (payload) {
          setLoreData(payload);
          setModal('lore');
        } else {
          setModal('none');
        }
      }),
    ];

    eventBus.emit('cmd:requestHudSync', undefined);
    return () => {
      for (const u of unsubs) u();
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => {
      setToast((cur) => (cur?.id === toast.id ? null : cur));
    }, 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    eventBus.emit('cmd:setModalOpen', { open: modal !== 'none' });
  }, [modal]);

  return (
    <div className="app-root">
      <div ref={hostRef} className="phaser-canvas-host" />

      <Hud
        hud={hud}
        toast={toast}
        onOpenInventory={() => setModal('inventory')}
        onOpenPause={() => setModal('pause')}
      />

      {modal === 'inventory' && (
        <InventoryModal
          hud={hud}
          slots={hud.inventory}
          capacity={hud.inventoryCapacity}
          equipment={hud.equipment}
          onClose={() => setModal('none')}
        />
      )}

      {modal === 'checkpoint' && (
        <CheckpointModal
          checkpoints={hud.checkpoints}
          onClose={() => setModal('none')}
        />
      )}

      {modal === 'pause' && (
        <PauseModal
          audio={audio}
          reduceShake={reduceShake}
          keybindings={hud.keybindings}
          onChangeAudio={setAudio}
          onToggleReduceShake={setReduceShake}
          onClose={() => setModal('none')}
        />
      )}

      {modal === 'lore' && loreData && (
        <LoreModal
          title={loreData.title}
          inscription={loreData.inscription}
          onClose={() => setModal('none')}
        />
      )}
    </div>
  );
};
