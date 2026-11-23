import Phaser from 'phaser';
import { DIRECTION_ROW_INDEX, type Direction8 } from '../rules/iso.ts';
import {
  getOrderedVisualLayers,
  type EquipmentLoadoutState,
  type EquipmentSlotId,
} from '../rules/equipment.ts';

export type PlayerAnimState =
  | 'idle'
  | 'walk'
  | 'attack'
  | 'dodge'
  | 'block'
  | 'hurt'
  | 'stagger'
  | 'switch'
  | 'death';

interface AnimRangeConfig {
  startCol: number;
  endCol: number;
  fps: number;
  loop: boolean;
}

const COLS_PER_ROW = 30;

const ANIM_RANGES: Record<PlayerAnimState, AnimRangeConfig> = {
  idle: { startCol: 0, endCol: 3, fps: 5, loop: true },
  walk: { startCol: 4, endCol: 9, fps: 12, loop: true },
  attack: { startCol: 10, endCol: 13, fps: 16, loop: false },
  dodge: { startCol: 14, endCol: 16, fps: 14, loop: false },
  block: { startCol: 17, endCol: 18, fps: 8, loop: true },
  hurt: { startCol: 19, endCol: 20, fps: 10, loop: false },
  stagger: { startCol: 21, endCol: 23, fps: 7, loop: true },
  switch: { startCol: 24, endCol: 25, fps: 9, loop: false },
  death: { startCol: 26, endCol: 29, fps: 8, loop: false },
};

const ALL_SLOTS: (EquipmentSlotId | 'body')[] = [
  'body',
  'headgear',
  'chest',
  'legs',
  'gloves',
  'boots',
  'mainHand',
  'offHand',
  'accessory',
];

/**
 * Modular 8-Directional Sprite-Layer Compositor for the Protagonist (Section 3):
 * - Synchronizes frame stepping across all 9 visual equipment layers.
 * - Dynamically re-orders layer depth per direction so North/South/East/West occlusion
 *   of weapons, shields, armor, and cloaks is always accurate.
 */
export class ModularPlayerRig {
  public readonly physicsSprite: Phaser.Physics.Arcade.Sprite;
  private readonly scene: Phaser.Scene;
  private readonly layerSprites = new Map<EquipmentSlotId | 'body', Phaser.GameObjects.Sprite>();

  private animState: PlayerAnimState = 'idle';
  private animElapsed = 0;
  private currentCol = 0;
  private customAttackFps = 16;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;
    // Invisible physics anchor sprite for Arcade collision
    this.physicsSprite = scene.physics.add.sprite(x, y, 'layer-body-base', 0);
    this.physicsSprite.setOrigin(0.5, 0.86);
    this.physicsSprite.setAlpha(0);
    const body = this.physicsSprite.body as Phaser.Physics.Arcade.Body;
    body.setCircle(10, 14, 34);

    // Create one synchronized sprite per modular layer slot
    for (const slot of ALL_SLOTS) {
      const sp = scene.add.sprite(x, y, 'layer-body-base', 0);
      sp.setOrigin(0.5, 0.86);
      sp.setVisible(false);
      this.layerSprites.set(slot, sp);
    }
  }

  get x(): number {
    return this.physicsSprite.x;
  }

  set x(val: number) {
    this.physicsSprite.x = val;
  }

  get y(): number {
    return this.physicsSprite.y;
  }

  set y(val: number) {
    this.physicsSprite.y = val;
  }

  get body(): Phaser.Physics.Arcade.Body {
    return this.physicsSprite.body as Phaser.Physics.Arcade.Body;
  }

  setPosition(x: number, y: number): void {
    this.physicsSprite.setPosition(x, y);
    for (const sp of this.layerSprites.values()) {
      sp.setPosition(x, y);
    }
  }

  playState(state: PlayerAnimState, forceRestart = false, attackDurationSeconds?: number): void {
    if (attackDurationSeconds && state === 'attack') {
      this.customAttackFps = 4 / Math.max(0.12, attackDurationSeconds);
    }
    if (this.animState === state && !forceRestart) {
      return;
    }
    this.animState = state;
    this.animElapsed = 0;
    this.currentCol = ANIM_RANGES[state].startCol;
  }

  getState(): PlayerAnimState {
    return this.animState;
  }

  setAlpha(alpha: number): void {
    for (const sp of this.layerSprites.values()) {
      sp.setAlpha(alpha);
    }
  }

  setTintFill(color: number): void {
    for (const sp of this.layerSprites.values()) {
      sp.setTintFill(color);
    }
  }

  clearTint(): void {
    for (const sp of this.layerSprites.values()) {
      sp.clearTint();
    }
  }

  /**
   * Steps the animation clock and updates all active equipment layers in lockstep
   * for the current 8-direction and equipment loadout.
   */
  syncLayers(
    dt: number,
    direction: Direction8,
    loadout: EquipmentLoadoutState
  ): void {
    const cfg = ANIM_RANGES[this.animState];
    const fps = this.animState === 'attack' ? this.customAttackFps : cfg.fps;
    const frameCount = cfg.endCol - cfg.startCol + 1;

    this.animElapsed += dt;
    const rawStep = Math.floor(this.animElapsed * fps);
    if (cfg.loop) {
      this.currentCol = cfg.startCol + (rawStep % frameCount);
    } else {
      this.currentCol = Math.min(cfg.endCol, cfg.startCol + rawStep);
    }

    const row = DIRECTION_ROW_INDEX[direction];
    const frameIndex = row * COLS_PER_ROW + this.currentCol;
    const ordered = getOrderedVisualLayers(loadout, direction);
    const activeSlots = new Set(ordered.map((o) => o.slot));

    const px = this.physicsSprite.x;
    const py = this.physicsSprite.y;

    // Hide any unequipped layer slots
    for (const [slot, sp] of this.layerSprites.entries()) {
      if (!activeSlots.has(slot)) {
        sp.setVisible(false);
      }
    }

    // Position, texture-swap, frame-lock, and depth-sort each active layer
    ordered.forEach((layer, idx) => {
      const sp = this.layerSprites.get(layer.slot)!;
      if (sp.texture.key !== layer.textureKey) {
        sp.setTexture(layer.textureKey);
      }
      sp.setFrame(frameIndex);
      sp.setPosition(px, py);
      sp.setDepth(py + idx * 0.02);
      sp.setVisible(true);
    });
  }

  spawnAfterimage(direction: Direction8, loadout: EquipmentLoadoutState): void {
    const row = DIRECTION_ROW_INDEX[direction];
    const frameIndex = row * COLS_PER_ROW + this.currentCol;
    const ordered = getOrderedVisualLayers(loadout, direction);

    ordered.forEach((layer, idx) => {
      const ghost = this.scene.add.image(
        this.physicsSprite.x,
        this.physicsSprite.y,
        layer.textureKey,
        frameIndex
      );
      ghost.setOrigin(0.5, 0.86);
      ghost.setTint(0x54e8ff);
      ghost.setAlpha(0.36);
      ghost.setDepth(this.physicsSprite.y - 1 + idx * 0.01);
      this.scene.tweens.add({
        targets: ghost,
        alpha: 0,
        duration: 170,
        onComplete: () => ghost.destroy(),
      });
    });
  }
}
