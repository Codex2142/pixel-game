import Phaser from 'phaser';

export const MODULAR_LAYER_KEYS = [
  'layer-body-base',
  'layer-head-hood',
  'layer-head-helm',
  'layer-chest-surcoat',
  'layer-chest-plate',
  'layer-legs-greaves',
  'layer-gloves-gauntlets',
  'layer-boots-leather',
  'layer-weapon-dagger',
  'layer-weapon-greatsword',
  'layer-offhand-shield',
  'layer-accessory-cloak',
] as const;

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload(): void {
    // Terrain tiles
    this.load.image('tile-grass-0', 'assets/tile-grass-0.png');
    this.load.image('tile-grass-1', 'assets/tile-grass-1.png');
    this.load.image('tile-grass-2', 'assets/tile-grass-2.png');
    this.load.image('tile-dirt-path', 'assets/tile-dirt-path.png');
    this.load.image('tile-cobble', 'assets/tile-cobble.png');
    this.load.image('tile-ruin-floor', 'assets/tile-ruin-floor.png');
    this.load.image('tile-vault-floor', 'assets/tile-vault-floor.png');
    this.load.image('tile-bridge', 'assets/tile-bridge.png');
    this.load.spritesheet('tile-water', 'assets/tile-water-sheet.png', {
      frameWidth: 64,
      frameHeight: 40,
    });

    // Environmental Props
    this.load.image('prop-oak-0', 'assets/prop-oak-0.png');
    this.load.image('prop-oak-1', 'assets/prop-oak-1.png');
    this.load.image('prop-pine', 'assets/prop-pine.png');
    this.load.image('prop-bush', 'assets/prop-bush.png');
    this.load.image('prop-rock', 'assets/prop-rock.png');
    this.load.image('prop-ruin-pillar-broken', 'assets/prop-ruin-pillar-broken.png');
    this.load.image('prop-ruin-arch', 'assets/prop-ruin-arch.png');
    this.load.image('prop-outpost-tent', 'assets/prop-outpost-tent.png');
    this.load.image('prop-lore-tablet', 'assets/prop-lore-tablet.png');
    this.load.image('prop-dungeon-gate', 'assets/prop-dungeon-gate.png');

    this.load.spritesheet('prop-campfire', 'assets/prop-campfire-sheet.png', {
      frameWidth: 48,
      frameHeight: 48,
    });
    this.load.spritesheet('prop-waystone', 'assets/prop-waystone-sheet.png', {
      frameWidth: 64,
      frameHeight: 88,
    });
    this.load.spritesheet('prop-rune-pillar', 'assets/prop-rune-pillar-sheet.png', {
      frameWidth: 48,
      frameHeight: 84,
    });
    this.load.spritesheet('prop-vault-door', 'assets/prop-vault-door-sheet.png', {
      frameWidth: 80,
      frameHeight: 96,
    });
    this.load.spritesheet('prop-chest', 'assets/prop-chest-sheet.png', {
      frameWidth: 48,
      frameHeight: 44,
    });

    // Legacy player sheet + All 12 Modular 8-Directional Character & Equipment Layers
    this.load.spritesheet('player', 'assets/player-sheet.png', {
      frameWidth: 48,
      frameHeight: 56,
    });
    for (const key of MODULAR_LAYER_KEYS) {
      this.load.spritesheet(key, `assets/${key}.png`, {
        frameWidth: 48,
        frameHeight: 56,
      });
    }

    // Enemies
    this.load.spritesheet('goblin', 'assets/goblin-sheet.png', {
      frameWidth: 40,
      frameHeight: 44,
    });
    this.load.spritesheet('sentinel', 'assets/sentinel-sheet.png', {
      frameWidth: 64,
      frameHeight: 72,
    });

    // VFX
    this.load.spritesheet('vfx-slash', 'assets/vfx-slash-sheet.png', {
      frameWidth: 64,
      frameHeight: 64,
    });
    this.load.spritesheet('vfx-arcane', 'assets/vfx-arcane-sheet.png', {
      frameWidth: 32,
      frameHeight: 32,
    });
  }

  create(): void {
    this.anims.create({
      key: 'water-shimmer',
      frames: this.anims.generateFrameNumbers('tile-water', { start: 0, end: 2 }),
      frameRate: 3,
      repeat: -1,
    });

    this.anims.create({
      key: 'campfire-burn',
      frames: this.anims.generateFrameNumbers('prop-campfire', { start: 0, end: 3 }),
      frameRate: 7,
      repeat: -1,
    });

    this.anims.create({
      key: 'waystone-active',
      frames: this.anims.generateFrameNumbers('prop-waystone', { start: 1, end: 3 }),
      frameRate: 5,
      repeat: -1,
    });

    // Goblin animations
    this.anims.create({
      key: 'goblin-idle',
      frames: this.anims.generateFrameNumbers('goblin', { start: 0, end: 3 }),
      frameRate: 5,
      repeat: -1,
    });
    this.anims.create({
      key: 'goblin-walk',
      frames: this.anims.generateFrameNumbers('goblin', { start: 4, end: 7 }),
      frameRate: 9,
      repeat: -1,
    });
    this.anims.create({
      key: 'goblin-attack',
      frames: this.anims.generateFrameNumbers('goblin', { start: 8, end: 10 }),
      frameRate: 11,
      repeat: 0,
    });
    this.anims.create({
      key: 'goblin-hurt',
      frames: this.anims.generateFrameNumbers('goblin', { start: 11, end: 12 }),
      frameRate: 10,
      repeat: 0,
    });
    this.anims.create({
      key: 'goblin-death',
      frames: this.anims.generateFrameNumbers('goblin', { start: 13, end: 15 }),
      frameRate: 8,
      repeat: 0,
    });

    // Sentinel animations
    this.anims.create({
      key: 'sentinel-idle',
      frames: this.anims.generateFrameNumbers('sentinel', { start: 0, end: 3 }),
      frameRate: 4,
      repeat: -1,
    });
    this.anims.create({
      key: 'sentinel-walk',
      frames: this.anims.generateFrameNumbers('sentinel', { start: 4, end: 7 }),
      frameRate: 6,
      repeat: -1,
    });
    this.anims.create({
      key: 'sentinel-attack',
      frames: this.anims.generateFrameNumbers('sentinel', { start: 8, end: 11 }),
      frameRate: 8,
      repeat: 0,
    });
    this.anims.create({
      key: 'sentinel-hurt',
      frames: this.anims.generateFrameNumbers('sentinel', { start: 12, end: 13 }),
      frameRate: 10,
      repeat: 0,
    });
    this.anims.create({
      key: 'sentinel-death',
      frames: this.anims.generateFrameNumbers('sentinel', { start: 14, end: 17 }),
      frameRate: 7,
      repeat: 0,
    });

    // VFX animations
    this.anims.create({
      key: 'vfx-slash-anim',
      frames: this.anims.generateFrameNumbers('vfx-slash', { start: 0, end: 3 }),
      frameRate: 22,
      repeat: 0,
    });
    this.anims.create({
      key: 'vfx-arcane-anim',
      frames: this.anims.generateFrameNumbers('vfx-arcane', { start: 0, end: 3 }),
      frameRate: 14,
      repeat: -1,
    });

    this.scene.start('forest');
  }
}
