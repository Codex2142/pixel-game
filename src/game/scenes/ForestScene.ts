import Phaser from 'phaser';
import {
  tileToScreen,
  screenToTile,
  screenInputToVelocity,
  vectorToDirection8,
  direction8ToUnitVector,
  type Direction8,
} from '../rules/iso.ts';
import {
  createInitialPlayerStats,
  getDerivedStat,
  computeDamage,
  trySpendStamina,
  stepStaminaRegen,
  grantExperience,
  STAMINA_COSTS,
  type PlayerStatsState,
} from '../rules/stats.ts';
import {
  createInitialInventory,
  useInventoryItem,
  addItem,
  getItemCount,
  ITEM_CATALOG,
  type InventoryState,
  type ItemId,
} from '../rules/inventory.ts';
import {
  createInitialEquipmentState,
  syncEquipmentModifiers,
  equipItem,
  unequipSlot,
  switchPrimaryWeapon,
  canSwitchWeapon,
  getActiveWeaponKind,
  getActiveWeaponProfile,
  hasActiveShield,
  type EquipmentLoadoutState,
  type CombatActionLocks,
} from '../rules/equipment.ts';
import {
  createTargetLockState,
  acquireTargetOnCombatStart,
  validateOrReplaceTarget,
  toggleManualTargetLock,
  switchManualTarget,
  type TargetLockState,
  type TargetCandidate,
} from '../rules/targetLock.ts';
import {
  DEFAULT_KEYBINDINGS,
  validateKeybindings,
  type TargetAndCombatKeybindings,
} from '../rules/keybindings.ts';
import {
  createInitialPuzzleState,
  activateRunePillar,
  type RuinPuzzleState,
} from '../rules/puzzle.ts';
import {
  createEnemyBrain,
  stepEnemyBrain,
  transitionEnemyState,
  ENEMY_ARCHETYPES,
  type EnemyBrainState,
} from '../rules/ai.ts';
import { ActionBuffer } from '../rules/inputBuffer.ts';
import {
  saveGameState,
  loadGameState,
  clearGameState,
  SAVE_VERSION,
} from '../rules/saveSystem.ts';
import {
  buildEnchantedForestMap,
  MAP_SIZE,
  type EnchantedForestData,
  type CheckpointPlacement,
} from '../world/enchantedForestMap.ts';
import { ModularPlayerRig } from '../entities/ModularPlayerRig.ts';
import { eventBus, type CheckpointUiEntry } from '../bridge/EventBus.ts';
import { audioManager } from '../audio/AudioManager.ts';

const ISO_ORIGIN_X = 2000;
const ISO_ORIGIN_Y = 240;

const PLAYER_SPEED = 148;
const BLOCK_MOVE_SPEED = 68;
const DODGE_SPEED = 315;
const DODGE_DURATION = 0.27;
const DODGE_IFRAMES = 0.23;
const DODGE_COOLDOWN = 0.52;
const ARCANE_MAX_COOLDOWN = 3.5;

interface EnemyEntity {
  brain: EnemyBrainState;
  sprite: Phaser.Physics.Arcade.Sprite;
  hpBarBg: Phaser.GameObjects.Rectangle;
  hpBarFill: Phaser.GameObjects.Rectangle;
  nameLabel: Phaser.GameObjects.Text;
  telegraphRing: Phaser.GameObjects.Graphics;
  knockbackVx: number;
  knockbackVy: number;
  knockbackTimer: number;
}

interface ArcaneProjectile {
  sprite: Phaser.GameObjects.Sprite;
  vx: number;
  vy: number;
  ttl: number;
}

interface InteractTarget {
  kind: 'checkpoint' | 'pillar' | 'chest' | 'tablet' | 'dungeon_gate';
  id: string;
  prompt: string;
  x: number;
  y: number;
}

export class ForestScene extends Phaser.Scene {
  private mapData!: EnchantedForestData;
  private stats!: PlayerStatsState;
  private inventory!: InventoryState;
  private equipment!: EquipmentLoadoutState;
  private targetLock!: TargetLockState;
  private keybindings: TargetAndCombatKeybindings = { ...DEFAULT_KEYBINDINGS };
  private puzzle!: RuinPuzzleState;

  private discoveredCheckpoints = new Set<string>(['glade_waystone']);
  private lastCheckpointId = 'glade_waystone';
  private openedChests = new Set<string>();
  private sentinelDefeated = false;

  private playerRig!: ModularPlayerRig;
  private obstaclesGroup!: Phaser.Physics.Arcade.StaticGroup;
  private vaultDoorCollider: Phaser.Physics.Arcade.Body | null = null;
  private vaultDoorSprite!: Phaser.GameObjects.Sprite;

  private waystoneSprites = new Map<string, Phaser.GameObjects.Sprite>();
  private pillarSprites = new Map<string, Phaser.GameObjects.Sprite>();
  private chestSprites = new Map<string, Phaser.GameObjects.Sprite>();
  private interactHighlight!: Phaser.GameObjects.Graphics;
  private targetReticle!: Phaser.GameObjects.Graphics;
  private reticlePulseTime = 0;

  private enemies: EnemyEntity[] = [];
  private projectiles: ArcaneProjectile[] = [];

  private keys!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
    UP: Phaser.Input.Keyboard.Key;
    DOWN: Phaser.Input.Keyboard.Key;
    LEFT: Phaser.Input.Keyboard.Key;
    RIGHT: Phaser.Input.Keyboard.Key;
    SPACE: Phaser.Input.Keyboard.Key;
    E: Phaser.Input.Keyboard.Key;
    I: Phaser.Input.Keyboard.Key;
    Q: Phaser.Input.Keyboard.Key;
    J: Phaser.Input.Keyboard.Key;
    ONE: Phaser.Input.Keyboard.Key;
    TWO: Phaser.Input.Keyboard.Key;
    ESC: Phaser.Input.Keyboard.Key;
  };

  private actionBuffer = new ActionBuffer(0.16);
  private gameClock = 0;

  private facing: Direction8 = 'SE';
  private attackTimer = 0;
  private attackCooldownTimer = 0;
  private dodgeTimer = 0;
  private dodgeCooldownTimer = 0;
  private hurtTimer = 0;
  private staggerTimer = 0;
  private weaponSwitchTimer = 0;
  private isBlocking = false;
  private iframeTimer = 0;
  private dodgeDir = { x: 1, y: 0 };
  private arcaneCooldownTimer = 0;
  private playerDead = false;
  private modalOpen = false;

  // Camera follow & trauma screen shake
  private camFocus = { x: 0, y: 0 };
  private camLookAhead = { x: 0, y: 0 };
  private trauma = 0;
  private shakeTime = 0;
  private reduceShake = false;
  private hitStopTimer = 0;

  private currentZoneId = '';
  private nearestInteract: InteractTarget | null = null;
  private staminaInsufficientPulse = 0;
  private toastCounter = 1;
  private unsubscribers: (() => void)[] = [];

  constructor() {
    super('forest');
  }

  init(): void {
    this.mapData = buildEnchantedForestMap();
    this.stats = createInitialPlayerStats();
    this.inventory = createInitialInventory();
    this.equipment = createInitialEquipmentState();
    this.targetLock = createTargetLockState();
    this.keybindings = { ...DEFAULT_KEYBINDINGS };
    this.puzzle = createInitialPuzzleState();
    this.discoveredCheckpoints = new Set(['glade_waystone']);
    this.lastCheckpointId = 'glade_waystone';
    this.openedChests = new Set();
    this.sentinelDefeated = false;
    this.enemies = [];
    this.projectiles = [];
    this.actionBuffer.clear();
    this.gameClock = 0;
    this.attackTimer = 0;
    this.attackCooldownTimer = 0;
    this.dodgeTimer = 0;
    this.dodgeCooldownTimer = 0;
    this.hurtTimer = 0;
    this.staggerTimer = 0;
    this.weaponSwitchTimer = 0;
    this.isBlocking = false;
    this.playerDead = false;
    this.modalOpen = false;
    this.trauma = 0;
    this.hitStopTimer = 0;

    // Load saved state from localStorage if available
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = loadGameState(window.localStorage);
      if (saved) {
        this.stats.level = saved.player.level;
        this.stats.xp = saved.player.xp;
        this.stats.baseMaxHp = saved.player.baseMaxHp;
        this.stats.baseMaxStamina = saved.player.baseMaxStamina;
        this.stats.baseAttack = saved.player.baseAttack;
        this.stats.baseDefense = saved.player.baseDefense;
        this.inventory.slots = saved.inventory;
        if (saved.equipment) {
          this.equipment.equipped = { ...this.equipment.equipped, ...saved.equipment.equipped };
          this.equipment.storedShieldId = saved.equipment.storedShieldId;
          this.equipment.alternateWeaponId = saved.equipment.alternateWeaponId;
        }
        if (saved.keybindings) {
          this.keybindings = validateKeybindings(saved.keybindings);
        }
        syncEquipmentModifiers(this.equipment, this.stats);
        this.stats.hp = Math.min(saved.player.hp, getDerivedStat(this.stats, 'maxHp'));
        this.stats.stamina = Math.min(
          saved.player.stamina,
          getDerivedStat(this.stats, 'maxStamina')
        );
        this.discoveredCheckpoints = new Set(saved.world.discoveredCheckpoints);
        this.lastCheckpointId = saved.world.lastCheckpointId || 'glade_waystone';
        this.puzzle.solved = saved.world.puzzleSolved;
        if (this.puzzle.solved) {
          this.puzzle.activatedOrder = ['moon', 'sun', 'star'];
        }
        this.openedChests = new Set(saved.world.openedChests);
        this.sentinelDefeated = saved.world.sentinelDefeated;
      } else {
        syncEquipmentModifiers(this.equipment, this.stats);
        this.stats.hp = getDerivedStat(this.stats, 'maxHp');
        this.stats.stamina = getDerivedStat(this.stats, 'maxStamina');
      }
    } else {
      syncEquipmentModifiers(this.equipment, this.stats);
      this.stats.hp = getDerivedStat(this.stats, 'maxHp');
      this.stats.stamina = getDerivedStat(this.stats, 'maxStamina');
    }
  }

  create(): void {
    this.obstaclesGroup = this.physics.add.staticGroup();
    this.buildIsometricWorld();
    this.spawnPlayerAtCheckpoint(this.lastCheckpointId, false);
    this.spawnAllEnemies();
    this.setupInputs();
    this.setupAtmosphericMotes();
    this.setupBridgeListeners();

    this.cameras.main.setZoom(1.35);
    this.cameras.main.setBounds(250, 80, 3500, 2050);
    this.snapCameraToPlayer();

    this.syncHud();
    this.emitToast(
      `Sir Aldric ready! [${this.keybindings.toggleLockKey}] Target Lock • [${this.keybindings.switchTargetLeftKey}/${this.keybindings.switchTargetRightKey}] Switch Target • [${this.keybindings.switchWeaponKey}] Switch Dagger/Greatsword.`,
      'info'
    );
  }

  private getCombatActionLocks(): CombatActionLocks {
    return {
      isAttacking: this.attackTimer > 0,
      isReceivingDamage: this.hurtTimer > 0,
      isStaggered: this.staggerTimer > 0,
      isDodging: this.dodgeTimer > 0,
      isBlocking: this.isBlocking,
      isSwitchingWeapon: this.weaponSwitchTimer > 0,
    };
  }

  private getTargetCandidates(): TargetCandidate[] {
    return this.enemies.map((e) => ({
      id: e.brain.id,
      x: e.sprite.x,
      y: e.sprite.y,
      alive: e.brain.state !== 'dead',
    }));
  }

  private getLockedEnemyEntity(): EnemyEntity | null {
    if (!this.targetLock.lockedTargetId) return null;
    return (
      this.enemies.find(
        (e) => e.brain.id === this.targetLock.lockedTargetId && e.brain.state !== 'dead'
      ) ?? null
    );
  }

  private buildIsometricWorld(): void {
    const terrainMap: Record<string, string> = {
      grass_0: 'tile-grass-0',
      grass_1: 'tile-grass-1',
      grass_2: 'tile-grass-2',
      dirt_path: 'tile-dirt-path',
      cobble: 'tile-cobble',
      ruin_floor: 'tile-ruin-floor',
      vault_floor: 'tile-vault-floor',
      bridge: 'tile-bridge',
    };

    for (let ty = 0; ty < MAP_SIZE; ty++) {
      for (let tx = 0; tx < MAP_SIZE; tx++) {
        const kind = this.mapData.terrain[ty][tx];
        const pos = tileToScreen(tx, ty, ISO_ORIGIN_X, ISO_ORIGIN_Y);

        if (kind === 'water') {
          const water = this.add.sprite(pos.x, pos.y + 4, 'tile-water');
          water.play('water-shimmer');
          water.setDepth(-2000 + pos.y * 0.01);
          this.addStaticCircleCollider(pos.x, pos.y, 20);
        } else {
          const tex = terrainMap[kind] || 'tile-grass-0';
          const tile = this.add.image(pos.x, pos.y + 4, tex);
          tile.setDepth(-2000 + pos.y * 0.01);
        }

        if (tx === 2 || ty === 2 || tx === MAP_SIZE - 3 || ty === MAP_SIZE - 3) {
          this.addStaticCircleCollider(pos.x, pos.y, 22);
        }
      }
    }

    const propTexMap: Record<string, string> = {
      oak_0: 'prop-oak-0',
      oak_1: 'prop-oak-1',
      pine: 'prop-pine',
      bush: 'prop-bush',
      rock: 'prop-rock',
      ruin_pillar_broken: 'prop-ruin-pillar-broken',
      ruin_arch: 'prop-ruin-arch',
      outpost_tent: 'prop-outpost-tent',
    };

    for (const p of this.mapData.props) {
      const pos = tileToScreen(p.tx, p.ty, ISO_ORIGIN_X, ISO_ORIGIN_Y);
      if (p.kind === 'campfire') {
        const fire = this.add.sprite(pos.x, pos.y, 'prop-campfire');
        fire.setOrigin(0.5, 0.8);
        fire.play('campfire-burn');
        fire.setDepth(pos.y);
        const glow = this.add.circle(pos.x, pos.y - 8, 46, 0xff9a3c, 0.14);
        glow.setDepth(pos.y - 1);
        this.tweens.add({
          targets: glow,
          scale: 1.18,
          alpha: 0.22,
          duration: 750,
          yoyo: true,
          repeat: -1,
        });
      } else {
        const img = this.add.image(pos.x, pos.y, propTexMap[p.kind]);
        img.setOrigin(0.5, 0.88);
        img.setDepth(pos.y);
      }
      if (p.collides) {
        this.addStaticCircleCollider(pos.x, pos.y, p.collisionRadius ?? 15);
      }
    }

    for (const cp of this.mapData.checkpoints) {
      const pos = tileToScreen(cp.tx, cp.ty, ISO_ORIGIN_X, ISO_ORIGIN_Y);
      const isDiscovered = this.discoveredCheckpoints.has(cp.id);
      const sprite = this.add.sprite(pos.x, pos.y, 'prop-waystone', isDiscovered ? 1 : 0);
      sprite.setOrigin(0.5, 0.86);
      sprite.setDepth(pos.y);
      if (isDiscovered) {
        sprite.play('waystone-active');
      }
      this.waystoneSprites.set(cp.id, sprite);
      this.addStaticCircleCollider(pos.x, pos.y, 18);
    }

    for (const rp of this.mapData.runePillars) {
      const pos = tileToScreen(rp.tx, rp.ty, ISO_ORIGIN_X, ISO_ORIGIN_Y);
      const baseFrame = rp.rune === 'moon' ? 0 : rp.rune === 'sun' ? 2 : 4;
      const isLit = this.puzzle.solved || this.puzzle.activatedOrder.includes(rp.rune);
      const sprite = this.add.sprite(
        pos.x,
        pos.y,
        'prop-rune-pillar',
        isLit ? baseFrame + 1 : baseFrame
      );
      sprite.setOrigin(0.5, 0.88);
      sprite.setDepth(pos.y);
      this.pillarSprites.set(rp.id, sprite);
      this.addStaticCircleCollider(pos.x, pos.y, 15);
    }

    {
      const pos = tileToScreen(
        this.mapData.vaultDoor.tx,
        this.mapData.vaultDoor.ty,
        ISO_ORIGIN_X,
        ISO_ORIGIN_Y
      );
      this.vaultDoorSprite = this.add.sprite(
        pos.x,
        pos.y,
        'prop-vault-door',
        this.puzzle.solved ? 1 : 0
      );
      this.vaultDoorSprite.setOrigin(0.5, 0.88);
      this.vaultDoorSprite.setDepth(pos.y);
      const doorZone = this.add.zone(pos.x, pos.y, 40, 40);
      this.physics.add.existing(doorZone, true);
      this.vaultDoorCollider = doorZone.body as Phaser.Physics.Arcade.Body;
      this.obstaclesGroup.add(doorZone);
      if (this.puzzle.solved && this.vaultDoorCollider) {
        this.vaultDoorCollider.enable = false;
      }
    }

    for (const ch of this.mapData.chests) {
      const pos = tileToScreen(ch.tx, ch.ty, ISO_ORIGIN_X, ISO_ORIGIN_Y);
      const opened = this.openedChests.has(ch.id);
      const sprite = this.add.sprite(pos.x, pos.y, 'prop-chest', opened ? 1 : 0);
      sprite.setOrigin(0.5, 0.82);
      sprite.setDepth(pos.y);
      this.chestSprites.set(ch.id, sprite);
      this.addStaticCircleCollider(pos.x, pos.y, 14);
    }

    for (const lt of this.mapData.loreTablets) {
      const pos = tileToScreen(lt.tx, lt.ty, ISO_ORIGIN_X, ISO_ORIGIN_Y);
      const img = this.add.image(pos.x, pos.y, 'prop-lore-tablet');
      img.setOrigin(0.5, 0.85);
      img.setDepth(pos.y);
      this.addStaticCircleCollider(pos.x, pos.y, 12);
    }

    {
      const pos = tileToScreen(
        this.mapData.dungeonGate.tx,
        this.mapData.dungeonGate.ty,
        ISO_ORIGIN_X,
        ISO_ORIGIN_Y
      );
      const gate = this.add.image(pos.x, pos.y, 'prop-dungeon-gate');
      gate.setOrigin(0.5, 0.88);
      gate.setDepth(pos.y);
      this.addStaticCircleCollider(pos.x, pos.y, 34);
    }

    this.interactHighlight = this.add.graphics();
    this.interactHighlight.setDepth(9998);

    this.targetReticle = this.add.graphics();
    this.targetReticle.setDepth(9999);
  }

  private addStaticCircleCollider(x: number, y: number, radius: number): void {
    const zone = this.add.zone(x, y, radius * 2, radius * 2);
    this.physics.add.existing(zone, true);
    const body = zone.body as Phaser.Physics.Arcade.StaticBody;
    body.setCircle(radius);
    this.obstaclesGroup.add(zone);
  }

  private spawnPlayerAtCheckpoint(checkpointId: string, withFlash = true): void {
    const cp =
      this.mapData.checkpoints.find((c) => c.id === checkpointId) ?? this.mapData.checkpoints[0];
    const pos = tileToScreen(cp.spawnTx, cp.spawnTy, ISO_ORIGIN_X, ISO_ORIGIN_Y);

    if (!this.playerRig) {
      this.playerRig = new ModularPlayerRig(this, pos.x, pos.y);
      this.physics.add.collider(this.playerRig.physicsSprite, this.obstaclesGroup);
    } else {
      this.playerRig.setPosition(pos.x, pos.y);
      this.playerRig.body.setVelocity(0, 0);
    }

    this.playerRig.playState('idle', true);
    this.playerRig.syncLayers(0, this.facing, this.equipment);

    if (withFlash) {
      this.cameras.main.flash(260, 110, 225, 255);
    }
  }

  private spawnAllEnemies(): void {
    for (const e of this.enemies) {
      e.sprite.destroy();
      e.hpBarBg.destroy();
      e.hpBarFill.destroy();
      e.nameLabel.destroy();
      e.telegraphRing.destroy();
    }
    this.enemies = [];

    for (const sp of this.mapData.enemySpawns) {
      if (sp.kind === 'sentinel' && this.sentinelDefeated) {
        continue;
      }
      const pos = tileToScreen(sp.tx, sp.ty, ISO_ORIGIN_X, ISO_ORIGIN_Y);
      const patrolPts = sp.patrolTiles.map((pt) =>
        tileToScreen(pt.tx, pt.ty, ISO_ORIGIN_X, ISO_ORIGIN_Y)
      );
      const brain = createEnemyBrain(sp.id, sp.kind, pos.x, pos.y, patrolPts);
      const arch = ENEMY_ARCHETYPES[sp.kind];

      const sprite = this.physics.add.sprite(pos.x, pos.y, sp.kind, 0);
      sprite.setOrigin(0.5, 0.86);
      const body = sprite.body as Phaser.Physics.Arcade.Body;
      if (sp.kind === 'sentinel') {
        body.setCircle(18, 14, 34);
      } else {
        body.setCircle(10, 10, 22);
      }
      this.physics.add.collider(sprite, this.obstaclesGroup);
      sprite.play(`${sp.kind}-idle`);

      const barW = arch.isElite ? 54 : 34;
      const hpBarBg = this.add.rectangle(pos.x, pos.y - 44, barW + 2, 6, 0x12101a, 0.9);
      const hpBarFill = this.add.rectangle(
        pos.x - barW / 2,
        pos.y - 44,
        barW,
        4,
        arch.isElite ? 0xf5b841 : 0xe04848,
        1
      );
      hpBarFill.setOrigin(0, 0.5);
      const nameLabel = this.add.text(pos.x, pos.y - 53, arch.name, {
        fontFamily: 'Silkscreen, monospace',
        fontSize: arch.isElite ? '10px' : '8px',
        color: arch.isElite ? '#ffd875' : '#e8e4d8',
        stroke: '#12101a',
        strokeThickness: 3,
      });
      nameLabel.setOrigin(0.5, 0.5);

      const telegraphRing = this.add.graphics();

      this.enemies.push({
        brain,
        sprite,
        hpBarBg,
        hpBarFill,
        nameLabel,
        telegraphRing,
        knockbackVx: 0,
        knockbackVy: 0,
        knockbackTimer: 0,
      });
    }
  }

  private setupInputs(): void {
    const kb = this.input.keyboard!;
    this.keys = {
      W: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      UP: kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
      DOWN: kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
      LEFT: kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
      RIGHT: kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
      SPACE: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
      E: kb.addKey(Phaser.Input.Keyboard.KeyCodes.E),
      I: kb.addKey(Phaser.Input.Keyboard.KeyCodes.I),
      Q: kb.addKey(Phaser.Input.Keyboard.KeyCodes.Q),
      J: kb.addKey(Phaser.Input.Keyboard.KeyCodes.J),
      ONE: kb.addKey(Phaser.Input.Keyboard.KeyCodes.ONE),
      TWO: kb.addKey(Phaser.Input.Keyboard.KeyCodes.TWO),
      ESC: kb.addKey(Phaser.Input.Keyboard.KeyCodes.ESC),
    };

    this.input.mouse?.disableContextMenu();

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.modalOpen || this.playerDead) return;
      // Only orient toward cursor if no target is locked
      if (!this.targetLock.lockedTargetId) {
        const worldPt = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        this.facing = vectorToDirection8(
          worldPt.x - this.playerRig.x,
          worldPt.y - this.playerRig.y,
          this.facing
        );
      }
      if (pointer.rightButtonDown()) {
        this.actionBuffer.press('magic', this.gameClock);
      } else if (pointer.leftButtonDown()) {
        this.actionBuffer.press('attack', this.gameClock);
      }
    });

    // Dynamic keyboard listener supporting configurable bindings for Target Lock, Target Switch, Weapon Switch & Block
    kb.on('keydown', (event: KeyboardEvent) => {
      const pressed = event.key.toUpperCase();
      if (pressed === 'I') {
        eventBus.emit('ui:toggleInventoryModal', undefined);
        return;
      }
      if (pressed === 'ESCAPE') {
        eventBus.emit('ui:togglePauseModal', undefined);
        return;
      }
      if (this.modalOpen || this.playerDead) return;

      if (pressed === this.keybindings.toggleLockKey || (this.keybindings.toggleLockKey === 'TAB' && event.key === 'Tab')) {
        event.preventDefault();
        this.handleToggleTargetLock();
      } else if (pressed === this.keybindings.switchTargetLeftKey) {
        this.handleSwitchTarget('left');
      } else if (pressed === this.keybindings.switchTargetRightKey) {
        this.handleSwitchTarget('right');
      } else if (pressed === this.keybindings.switchWeaponKey) {
        this.handleWeaponSwitch();
      } else if (pressed === this.keybindings.blockKey) {
        this.trySetBlocking(true);
      }
    });

    kb.on('keyup', (event: KeyboardEvent) => {
      const released = event.key.toUpperCase();
      if (released === this.keybindings.blockKey) {
        this.trySetBlocking(false);
      }
    });

    this.keys.J.on('down', () => {
      if (!this.modalOpen && !this.playerDead) this.actionBuffer.press('attack', this.gameClock);
    });
    this.keys.Q.on('down', () => {
      if (!this.modalOpen && !this.playerDead) this.actionBuffer.press('magic', this.gameClock);
    });
    this.keys.SPACE.on('down', () => {
      if (!this.modalOpen && !this.playerDead) this.actionBuffer.press('dodge', this.gameClock);
    });
    this.keys.E.on('down', () => {
      if (!this.modalOpen && !this.playerDead) this.handleInteraction();
    });
    this.keys.ONE.on('down', () => {
      if (!this.modalOpen && !this.playerDead) this.consumeItem('health_potion');
    });
    this.keys.TWO.on('down', () => {
      if (!this.modalOpen && !this.playerDead) this.consumeItem('stamina_potion');
    });
  }

  private handleToggleTargetLock(): void {
    const lockedId = toggleManualTargetLock(
      this.targetLock,
      this.playerRig.x,
      this.playerRig.y,
      this.facing,
      this.getTargetCandidates()
    );
    audioManager.playTargetLock(lockedId !== null);
    if (lockedId) {
      const enemy = this.getLockedEnemyEntity();
      if (enemy) {
        const arch = ENEMY_ARCHETYPES[enemy.brain.kind];
        this.emitToast(`Target Locked: ${arch.name}`, 'info');
      }
    } else {
      this.emitToast('Target Lock released.', 'info');
    }
    this.syncHud();
  }

  private handleSwitchTarget(direction: 'left' | 'right'): void {
    const prevId = this.targetLock.lockedTargetId;
    const nextId = switchManualTarget(
      this.targetLock,
      this.playerRig.x,
      this.playerRig.y,
      this.facing,
      this.getTargetCandidates(),
      direction
    );
    if (nextId && nextId !== prevId) {
      audioManager.playTargetLock(true);
    } else if (!nextId) {
      audioManager.playLowStaminaClick();
      this.emitToast('No enemies within targeting range.', 'warning');
    }
    this.syncHud();
  }

  private handleWeaponSwitch(): void {
    const locks = this.getCombatActionLocks();
    const res = switchPrimaryWeapon(this.equipment, this.stats, locks);
    if (!res.success) {
      audioManager.playLowStaminaClick();
      this.emitToast(res.message, 'warning');
      return;
    }

    const kind = getActiveWeaponKind(this.equipment);
    this.weaponSwitchTimer = res.switchDuration;
    this.isBlocking = false;
    audioManager.playWeaponSwitch(kind);
    this.playerRig.playState('switch', true);
    this.spawnFloatingText(
      this.playerRig.x,
      this.playerRig.y - 46,
      kind === 'greatsword' ? 'GREATSWORD (2H)' : 'DAGGER + SHIELD',
      '#ffd859',
      11
    );
    this.emitToast(res.message, 'info');
    this.persistProgress();
    this.syncHud();
  }

  private trySetBlocking(active: boolean): void {
    if (!active) {
      this.isBlocking = false;
      return;
    }
    if (!hasActiveShield(this.equipment)) {
      if (getActiveWeaponKind(this.equipment) === 'greatsword') {
        this.emitToast('Cannot block with a Two-Handed Greatsword (requires Dagger + Shield).', 'warning');
      }
      this.isBlocking = false;
      return;
    }
    if (
      this.attackTimer > 0 ||
      this.dodgeTimer > 0 ||
      this.hurtTimer > 0 ||
      this.staggerTimer > 0 ||
      this.weaponSwitchTimer > 0
    ) {
      return;
    }
    this.isBlocking = true;
  }

  private setupAtmosphericMotes(): void {
    for (let i = 0; i < 45; i++) {
      const mx = ISO_ORIGIN_X + Phaser.Math.Between(-1100, 1100);
      const my = ISO_ORIGIN_Y + Phaser.Math.Between(120, 1650);
      const mote = this.add.circle(
        mx,
        my,
        Phaser.Math.Between(1, 2),
        i % 3 === 0 ? 0x54e8ff : 0xfcda66,
        0.55
      );
      mote.setDepth(5000);
      this.tweens.add({
        targets: mote,
        x: mx + Phaser.Math.Between(-45, 45),
        y: my - Phaser.Math.Between(25, 65),
        alpha: 0.1,
        duration: Phaser.Math.Between(2600, 4800),
        yoyo: true,
        repeat: -1,
      });
    }
  }

  private setupBridgeListeners(): void {
    this.unsubscribers.push(
      eventBus.on('cmd:useItem', ({ itemId }) => {
        this.consumeItem(itemId);
      }),
      eventBus.on('cmd:equipItem', ({ itemId }) => {
        const res = equipItem(
          this.equipment,
          this.stats,
          itemId,
          this.getCombatActionLocks()
        );
        if (res.success) {
          if (res.switchDuration > 0) {
            this.weaponSwitchTimer = res.switchDuration;
            this.playerRig.playState('switch', true);
          }
          audioManager.playWeaponSwitch(getActiveWeaponKind(this.equipment));
          this.emitToast(res.message, 'success');
          this.persistProgress();
        } else {
          audioManager.playLowStaminaClick();
          this.emitToast(res.message, 'warning');
        }
        this.syncHud();
      }),
      eventBus.on('cmd:unequipSlot', ({ slot }) => {
        const res = unequipSlot(
          this.equipment,
          this.stats,
          slot,
          this.getCombatActionLocks()
        );
        if (res.success) {
          this.isBlocking = false;
          audioManager.playWeaponSwitch(getActiveWeaponKind(this.equipment));
          this.emitToast(res.message, 'info');
          this.persistProgress();
        } else {
          audioManager.playLowStaminaClick();
          this.emitToast(res.message, 'warning');
        }
        this.syncHud();
      }),
      eventBus.on('cmd:switchWeapon', () => {
        this.handleWeaponSwitch();
      }),
      eventBus.on('cmd:toggleTargetLock', () => {
        this.handleToggleTargetLock();
      }),
      eventBus.on('cmd:switchTarget', ({ direction }) => {
        this.handleSwitchTarget(direction);
      }),
      eventBus.on('cmd:setKeybindings', (nextBindings) => {
        this.keybindings = validateKeybindings(nextBindings);
        this.persistProgress();
        this.syncHud();
      }),
      eventBus.on('cmd:teleport', ({ checkpointId }) => {
        this.teleportToCheckpoint(checkpointId);
      }),
      eventBus.on('cmd:setModalOpen', ({ open }) => {
        this.modalOpen = open;
        if (open && this.playerRig) {
          this.playerRig.body.setVelocity(0, 0);
          this.isBlocking = false;
        }
      }),
      eventBus.on('cmd:setAudioSettings', (settings) => {
        audioManager.setSettings(settings);
      }),
      eventBus.on('cmd:setReduceShake', ({ reduceShake }) => {
        this.reduceShake = reduceShake;
      }),
      eventBus.on('cmd:resetPrototype', () => {
        if (typeof window !== 'undefined' && window.localStorage) {
          clearGameState(window.localStorage);
        }
        this.cleanupBridgeListeners();
        this.scene.restart();
      }),
      eventBus.on('cmd:requestHudSync', () => {
        this.syncHud();
      })
    );

    this.events.once('shutdown', () => {
      this.cleanupBridgeListeners();
    });
  }

  private cleanupBridgeListeners(): void {
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];
  }

  update(_time: number, deltaMs: number): void {
    const rawDt = Math.min(0.05, deltaMs / 1000);

    if (this.hitStopTimer > 0) {
      this.hitStopTimer = Math.max(0, this.hitStopTimer - rawDt);
      this.updateCamera(rawDt);
      return;
    }

    const dt = this.modalOpen ? 0 : rawDt;
    this.gameClock += dt;

    if (!this.modalOpen) {
      // Continuously validate current target lock (auto-replacing if target dies or leaves breakRange)
      validateOrReplaceTarget(
        this.targetLock,
        this.playerRig.x,
        this.playerRig.y,
        this.facing,
        this.getTargetCandidates(),
        true
      );
      this.updatePlayer(dt);
      this.updateEnemies(dt);
      this.updateProjectiles(dt);
      this.updateNearestInteractable();
      this.updateTargetReticle(rawDt);
      this.updateZoneCheck();
    }

    this.updateCamera(rawDt);
    this.syncHud();
  }

  private updatePlayer(dt: number): void {
    const body = this.playerRig.body;
    if (this.playerDead) {
      body.setVelocity(0, 0);
      this.playerRig.syncLayers(dt, this.facing, this.equipment);
      return;
    }

    this.attackCooldownTimer = Math.max(0, this.attackCooldownTimer - dt);
    this.dodgeCooldownTimer = Math.max(0, this.dodgeCooldownTimer - dt);
    this.iframeTimer = Math.max(0, this.iframeTimer - dt);
    this.arcaneCooldownTimer = Math.max(0, this.arcaneCooldownTimer - dt);
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    this.staggerTimer = Math.max(0, this.staggerTimer - dt);
    this.weaponSwitchTimer = Math.max(0, this.weaponSwitchTimer - dt);

    if (!hasActiveShield(this.equipment)) {
      this.isBlocking = false;
    }

    const inX =
      (this.keys.D.isDown || this.keys.RIGHT.isDown ? 1 : 0) -
      (this.keys.A.isDown || this.keys.LEFT.isDown ? 1 : 0);
    const inY =
      (this.keys.S.isDown || this.keys.DOWN.isDown ? 1 : 0) -
      (this.keys.W.isDown || this.keys.UP.isDown ? 1 : 0);

    // If a target is locked, orient facing toward the locked target when idle/blocking/attacking
    const lockedEnemy = this.getLockedEnemyEntity();

    const isActionLocked =
      this.attackTimer > 0 ||
      this.dodgeTimer > 0 ||
      this.hurtTimer > 0 ||
      this.staggerTimer > 0 ||
      this.weaponSwitchTimer > 0;

    if (!isActionLocked) {
      if (this.dodgeCooldownTimer <= 0 && this.actionBuffer.consume('dodge', this.gameClock)) {
        this.tryStartDodge(inX, inY);
      } else if (
        this.attackCooldownTimer <= 0 &&
        this.actionBuffer.consume('attack', this.gameClock)
      ) {
        this.tryStartAttack();
      } else if (
        this.arcaneCooldownTimer <= 0 &&
        this.actionBuffer.consume('magic', this.gameClock)
      ) {
        this.tryCastArcaneBolt();
      }
    }

    if (this.staggerTimer > 0) {
      body.setVelocity(0, 0);
      this.playerRig.setAlpha(1);
      this.playerRig.playState('stagger');
    } else if (this.hurtTimer > 0) {
      body.setVelocity(0, 0);
      this.playerRig.setAlpha(1);
      this.playerRig.playState('hurt');
    } else if (this.weaponSwitchTimer > 0) {
      // Allow slow repositioning during weapon switch while playing the weapon-switch animation
      const vel = screenInputToVelocity(inX, inY, PLAYER_SPEED * 0.55);
      body.setVelocity(vel.x, vel.y);
      this.playerRig.setAlpha(1);
      this.playerRig.playState('switch');
    } else if (this.dodgeTimer > 0) {
      this.dodgeTimer = Math.max(0, this.dodgeTimer - dt);
      body.setVelocity(this.dodgeDir.x * DODGE_SPEED, this.dodgeDir.y * DODGE_SPEED);
      this.playerRig.setAlpha(this.iframeTimer > 0 ? 0.68 : 1);
      this.playerRig.playState('dodge');
      if (Math.random() < 0.38) {
        this.playerRig.spawnAfterimage(this.facing, this.equipment);
      }
    } else if (this.attackTimer > 0) {
      this.attackTimer = Math.max(0, this.attackTimer - dt);
      body.setVelocity(0, 0);
      this.playerRig.setAlpha(1);
    } else {
      this.playerRig.setAlpha(1);
      const moveSpeed = this.isBlocking ? BLOCK_MOVE_SPEED : PLAYER_SPEED;
      const vel = screenInputToVelocity(inX, inY, moveSpeed);
      body.setVelocity(vel.x, vel.y);

      if (lockedEnemy) {
        this.facing = vectorToDirection8(
          lockedEnemy.sprite.x - this.playerRig.x,
          lockedEnemy.sprite.y - this.playerRig.y,
          this.facing
        );
      } else if (Math.abs(vel.x) > 1 || Math.abs(vel.y) > 1) {
        this.facing = vectorToDirection8(vel.x, vel.y, this.facing);
      }

      if (this.isBlocking) {
        this.playerRig.playState('block');
      } else if (Math.abs(vel.x) > 1 || Math.abs(vel.y) > 1) {
        this.playerRig.playState('walk');
      } else {
        this.playerRig.playState('idle');
      }
    }

    stepStaminaRegen(
      this.stats,
      dt,
      this.attackTimer > 0 ||
        this.dodgeTimer > 0 ||
        this.isBlocking ||
        this.staggerTimer > 0
    );

    this.playerRig.syncLayers(dt, this.facing, this.equipment);
  }

  private tryStartDodge(inX: number, inY: number): void {
    if (!trySpendStamina(this.stats, STAMINA_COSTS.dodge)) {
      this.notifyInsufficientStamina();
      return;
    }
    this.isBlocking = false;
    audioManager.playDodge();
    this.dodgeTimer = DODGE_DURATION;
    this.iframeTimer = DODGE_IFRAMES;
    this.dodgeCooldownTimer = DODGE_COOLDOWN;

    if (inX !== 0 || inY !== 0) {
      const len = Math.hypot(inX, inY);
      this.dodgeDir = { x: inX / len, y: (inY / len) * 0.85 };
      this.facing = vectorToDirection8(inX, inY, this.facing);
    } else {
      const u = direction8ToUnitVector(this.facing);
      this.dodgeDir = { x: u.x, y: u.y * 0.85 };
    }
    this.playerRig.playState('dodge', true);
  }

  private tryStartAttack(): void {
    const profile = getActiveWeaponProfile(this.equipment);
    if (!trySpendStamina(this.stats, profile.staminaCost)) {
      this.notifyInsufficientStamina();
      return;
    }
    this.isBlocking = false;

    // Hybrid Auto-Lock: automatically acquire a suitable target when combat begins if none is locked!
    acquireTargetOnCombatStart(
      this.targetLock,
      this.playerRig.x,
      this.playerRig.y,
      this.facing,
      this.getTargetCandidates()
    );

    const lockedEnemy = this.getLockedEnemyEntity();
    let dx = 0;
    let dy = 0;

    if (lockedEnemy) {
      dx = lockedEnemy.sprite.x - this.playerRig.x;
      dy = lockedEnemy.sprite.y - this.playerRig.y;
    } else {
      const pointer = this.input.activePointer;
      const worldPt = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      dx = worldPt.x - this.playerRig.x;
      dy = worldPt.y - (this.playerRig.y - 16);
    }

    if (Math.hypot(dx, dy) < 4) {
      const u = direction8ToUnitVector(this.facing);
      dx = u.x;
      dy = u.y;
    }

    this.facing = vectorToDirection8(dx, dy, this.facing);
    const aimAngle = Math.atan2(dy, dx);

    audioManager.playSwordSwing();
    this.attackTimer = profile.attackDuration;
    this.attackCooldownTimer = profile.attackCooldown;
    this.playerRig.playState('attack', true, profile.attackDuration);

    // Spawn weapon-scaled Slash Arc VFX
    const slashDist = profile.weaponKind === 'greatsword' ? 34 : 24;
    const slashX = this.playerRig.x + Math.cos(aimAngle) * slashDist;
    const slashY = this.playerRig.y - 16 + Math.sin(aimAngle) * (slashDist * 0.78);
    const slash = this.add.sprite(slashX, slashY, 'vfx-slash', 0);
    slash.setRotation(aimAngle);
    slash.setScale(profile.weaponKind === 'greatsword' ? 1.32 : 0.9);
    if (profile.weaponKind === 'greatsword') {
      slash.setTint(0xffd875);
    }
    slash.setDepth(this.playerRig.y + 20);
    slash.play('vfx-slash-anim');
    slash.once('animationcomplete', () => slash.destroy());

    const playerAtk = getDerivedStat(this.stats, 'attack');
    const critChance = getDerivedStat(this.stats, 'critChance');
    let hitAny = false;

    for (const enemy of this.enemies) {
      if (enemy.brain.state === 'dead') continue;
      const ex = enemy.sprite.x - this.playerRig.x;
      const ey = enemy.sprite.y - this.playerRig.y;
      const dist = Math.hypot(ex, ey);
      const reach = profile.reach + (enemy.brain.kind === 'sentinel' ? 14 : 0);
      if (dist <= reach) {
        const angleToEnemy = Math.atan2(ey, ex);
        const angleDiff = Math.abs(Phaser.Math.Angle.Wrap(angleToEnemy - aimAngle));
        if (angleDiff <= profile.cleaveHalfAngleRad || dist <= 28) {
          const arch = ENEMY_ARCHETYPES[enemy.brain.kind];
          const dmg = computeDamage(playerAtk, arch.defense, critChance);
          this.damageEnemy(
            enemy,
            dmg.amount,
            dmg.isCrit,
            Math.cos(aimAngle),
            Math.sin(aimAngle),
            profile.staggerPower
          );
          hitAny = true;
        }
      }
    }

    if (hitAny) {
      this.hitStopTimer = profile.weaponKind === 'greatsword' ? 0.065 : 0.04;
      this.addCameraTrauma(profile.weaponKind === 'greatsword' ? 0.35 : 0.22);
    }
  }

  private tryCastArcaneBolt(): void {
    if (!trySpendStamina(this.stats, STAMINA_COSTS.arcaneBolt)) {
      this.notifyInsufficientStamina();
      return;
    }
    this.isBlocking = false;

    acquireTargetOnCombatStart(
      this.targetLock,
      this.playerRig.x,
      this.playerRig.y,
      this.facing,
      this.getTargetCandidates()
    );

    audioManager.playArcaneBolt();
    this.arcaneCooldownTimer = ARCANE_MAX_COOLDOWN;
    this.attackTimer = 0.2;

    const lockedEnemy = this.getLockedEnemyEntity();
    let dx = 0;
    let dy = 0;
    if (lockedEnemy) {
      dx = lockedEnemy.sprite.x - this.playerRig.x;
      dy = (lockedEnemy.sprite.y - 16) - (this.playerRig.y - 18);
    } else {
      const pointer = this.input.activePointer;
      const worldPt = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      dx = worldPt.x - this.playerRig.x;
      dy = worldPt.y - (this.playerRig.y - 18);
    }
    this.facing = vectorToDirection8(dx, dy, this.facing);
    const len = Math.max(0.01, Math.hypot(dx, dy));
    const speed = 330;

    const bolt = this.add.sprite(this.playerRig.x, this.playerRig.y - 18, 'vfx-arcane', 0);
    bolt.play('vfx-arcane-anim');
    bolt.setDepth(this.playerRig.y + 15);

    this.projectiles.push({
      sprite: bolt,
      vx: (dx / len) * speed,
      vy: (dy / len) * speed,
      ttl: 1.35,
    });
  }

  private updateProjectiles(dt: number): void {
    const playerAtk = Math.round(getDerivedStat(this.stats, 'attack') * 1.25);
    const critChance = getDerivedStat(this.stats, 'critChance');

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.ttl -= dt;
      p.sprite.x += p.vx * dt;
      p.sprite.y += p.vy * dt;
      p.sprite.setDepth(p.sprite.y + 20);

      if (Math.random() < 0.5) {
        const spark = this.add.circle(p.sprite.x, p.sprite.y, 2, 0x54e8ff, 0.7);
        spark.setDepth(p.sprite.y);
        this.tweens.add({
          targets: spark,
          alpha: 0,
          scale: 0.2,
          duration: 160,
          onComplete: () => spark.destroy(),
        });
      }

      let hit = false;
      for (const enemy of this.enemies) {
        if (enemy.brain.state === 'dead') continue;
        const dist = Math.hypot(enemy.sprite.x - p.sprite.x, enemy.sprite.y - 16 - p.sprite.y);
        const hitRadius = enemy.brain.kind === 'sentinel' ? 32 : 22;
        if (dist <= hitRadius) {
          const arch = ENEMY_ARCHETYPES[enemy.brain.kind];
          const dmg = computeDamage(playerAtk, Math.round(arch.defense * 0.6), critChance);
          const len = Math.max(1, Math.hypot(p.vx, p.vy));
          this.damageEnemy(enemy, dmg.amount, dmg.isCrit, p.vx / len, p.vy / len, 0.25);
          this.addCameraTrauma(0.22);
          hit = true;
          break;
        }
      }

      if (hit || p.ttl <= 0) {
        const burst = this.add.circle(p.sprite.x, p.sprite.y, 14, 0xa268f6, 0.65);
        burst.setDepth(p.sprite.y + 30);
        this.tweens.add({
          targets: burst,
          scale: 1.8,
          alpha: 0,
          duration: 180,
          onComplete: () => burst.destroy(),
        });
        p.sprite.destroy();
        this.projectiles.splice(i, 1);
      }
    }
  }

  private damageEnemy(
    enemy: EnemyEntity,
    amount: number,
    isCrit: boolean,
    dirX: number,
    dirY: number,
    staggerPower = 0.22
  ): void {
    const arch = ENEMY_ARCHETYPES[enemy.brain.kind];
    enemy.brain.hp = Math.max(0, enemy.brain.hp - amount);
    audioManager.playEnemyHit(isCrit);

    enemy.sprite.setTintFill(isCrit ? 0xfff08a : 0xffffff);
    this.time.delayedCall(90, () => {
      if (enemy.sprite.active) enemy.sprite.clearTint();
    });

    const kbStrength = (arch.isElite ? 65 : 140) * (0.75 + staggerPower);
    enemy.knockbackVx = dirX * kbStrength;
    enemy.knockbackVy = dirY * kbStrength;
    enemy.knockbackTimer = 0.14;

    this.spawnFloatingText(
      enemy.sprite.x,
      enemy.sprite.y - 36,
      isCrit ? `${amount}!` : `${amount}`,
      isCrit ? '#ffd859' : '#ffffff',
      isCrit ? 15 : 12
    );

    if (enemy.brain.hp <= 0) {
      this.handleEnemyDefeat(enemy);
    } else if (!arch.isElite || enemy.brain.state !== 'windup' || staggerPower >= 0.45) {
      transitionEnemyState(enemy.brain, 'hurt', arch.hurtDuration + staggerPower * 0.2);
      enemy.sprite.play(`${enemy.brain.kind}-hurt`, true);
    }
  }

  private handleEnemyDefeat(enemy: EnemyEntity): void {
    const arch = ENEMY_ARCHETYPES[enemy.brain.kind];
    enemy.brain.state = 'dead';
    enemy.telegraphRing.clear();
    const body = enemy.sprite.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
    body.enable = false;

    enemy.sprite.play(`${enemy.brain.kind}-death`, true);
    enemy.hpBarBg.setVisible(false);
    enemy.hpBarFill.setVisible(false);
    enemy.nameLabel.setVisible(false);

    this.addCameraTrauma(arch.isElite ? 0.65 : 0.32);

    // Immediately validate/switch target lock if the defeated enemy was locked!
    validateOrReplaceTarget(
      this.targetLock,
      this.playerRig.x,
      this.playerRig.y,
      this.facing,
      this.getTargetCandidates(),
      true
    );

    const xpRes = grantExperience(this.stats, arch.xpReward);
    this.spawnFloatingText(
      enemy.sprite.x,
      enemy.sprite.y - 52,
      `+${arch.xpReward} XP`,
      '#54e8ff',
      12
    );

    if (enemy.brain.kind === 'sentinel') {
      this.sentinelDefeated = true;
      addItem(this.inventory, 'sentinel_core', 1);
      this.emitToast(
        "Defeated the Moss-Stone Sentinel! Obtained [Sentinel's Amber Core] Quest Trophy!",
        'success'
      );
      this.persistProgress();
    }

    if (xpRes.leveledUp) {
      audioManager.playLevelUp();
      this.triggerLevelUpVfx();
      eventBus.emit('ui:levelUp', {
        level: this.stats.level,
        maxHp: getDerivedStat(this.stats, 'maxHp'),
        maxStamina: getDerivedStat(this.stats, 'maxStamina'),
        attack: getDerivedStat(this.stats, 'attack'),
      });
    }
  }

  private updateEnemies(dt: number): void {
    for (const enemy of this.enemies) {
      const { brain, sprite } = enemy;
      if (brain.state === 'dead') continue;

      brain.x = sprite.x;
      brain.y = sprite.y;

      const intent = stepEnemyBrain(
        brain,
        this.playerRig.x,
        this.playerRig.y,
        !this.playerDead,
        dt
      );
      const body = sprite.body as Phaser.Physics.Arcade.Body;

      if (enemy.knockbackTimer > 0) {
        enemy.knockbackTimer = Math.max(0, enemy.knockbackTimer - dt);
        body.setVelocity(enemy.knockbackVx, enemy.knockbackVy);
      } else {
        body.setVelocity(intent.vx, intent.vy);
      }

      if (Math.abs(intent.vx) > 2) {
        sprite.setFlipX(intent.vx < 0);
      } else if (brain.state === 'windup' || brain.state === 'attack') {
        sprite.setFlipX(this.playerRig.x < sprite.x);
      }

      if (brain.state === 'windup' || brain.state === 'attack') {
        if (sprite.anims.currentAnim?.key !== `${brain.kind}-attack`) {
          sprite.play(`${brain.kind}-attack`, true);
        }
      } else if (brain.state === 'patrol' || brain.state === 'chase') {
        if (sprite.anims.currentAnim?.key !== `${brain.kind}-walk`) {
          sprite.play(`${brain.kind}-walk`, true);
        }
      } else if (brain.state === 'idle' || brain.state === 'recover') {
        if (sprite.anims.currentAnim?.key !== `${brain.kind}-idle`) {
          sprite.play(`${brain.kind}-idle`, true);
        }
      }

      enemy.telegraphRing.clear();
      const arch = ENEMY_ARCHETYPES[brain.kind];
      if (brain.state === 'windup') {
        enemy.telegraphRing.setDepth(sprite.y - 2);
        const radius = arch.aoeRadius ?? 38;
        enemy.telegraphRing.lineStyle(2, 0xff4d4d, 0.85);
        enemy.telegraphRing.strokeEllipse(sprite.x, sprite.y, radius * 2, radius * 1.1);
        enemy.telegraphRing.fillStyle(0xff4d4d, 0.15 + intent.telegraphRatio * 0.25);
        enemy.telegraphRing.fillEllipse(
          sprite.x,
          sprite.y,
          radius * 2 * intent.telegraphRatio,
          radius * 1.1 * intent.telegraphRatio
        );
      }

      if (intent.triggerHitCheck && !this.playerDead) {
        const dist = Math.hypot(this.playerRig.x - sprite.x, this.playerRig.y - sprite.y);
        const hitRange = arch.aoeRadius ?? arch.attackRange + 12;

        if (brain.kind === 'sentinel') {
          const wave = this.add.ellipse(sprite.x, sprite.y, 160, 88, 0xf5b841, 0.35);
          wave.setDepth(sprite.y - 1);
          this.tweens.add({
            targets: wave,
            scale: 1.25,
            alpha: 0,
            duration: 280,
            onComplete: () => wave.destroy(),
          });
          this.addCameraTrauma(0.45);
        }

        if (dist <= hitRange) {
          this.damagePlayer(arch.attack, sprite.x, sprite.y, arch.isElite);
        }
      }

      sprite.setDepth(sprite.y);
      const barW = arch.isElite ? 54 : 34;
      const yOffset = arch.isElite ? 60 : 42;
      const isLocked = this.targetLock.lockedTargetId === brain.id;
      const showBar =
        isLocked ||
        brain.hp < brain.maxHp ||
        brain.state === 'chase' ||
        brain.state === 'windup' ||
        brain.state === 'attack';

      enemy.hpBarBg.setVisible(showBar);
      enemy.hpBarFill.setVisible(showBar);
      enemy.nameLabel.setVisible(showBar);

      if (showBar) {
        enemy.hpBarBg.setPosition(sprite.x, sprite.y - yOffset);
        enemy.hpBarBg.setDepth(sprite.y + 40);
        enemy.hpBarFill.setPosition(sprite.x - barW / 2, sprite.y - yOffset);
        enemy.hpBarFill.width = Math.max(0, (brain.hp / brain.maxHp) * barW);
        enemy.hpBarFill.setDepth(sprite.y + 41);
        enemy.nameLabel.setPosition(sprite.x, sprite.y - yOffset - 9);
        enemy.nameLabel.setDepth(sprite.y + 41);
      }
    }
  }

  private damagePlayer(
    rawEnemyAtk: number,
    sourceX: number,
    sourceY: number,
    isHeavyBlow = false
  ): void {
    if (this.iframeTimer > 0 || this.playerDead) {
      this.spawnFloatingText(this.playerRig.x, this.playerRig.y - 42, 'DODGED', '#54e8ff', 11);
      return;
    }

    // Auto-acquire attacker if no target is locked when combat engages
    acquireTargetOnCombatStart(
      this.targetLock,
      this.playerRig.x,
      this.playerRig.y,
      this.facing,
      this.getTargetCandidates()
    );

    const playerDef = getDerivedStat(this.stats, 'defense');
    const rawDmg = computeDamage(rawEnemyAtk, playerDef, 0).amount;

    // Check Shield Guard Blocking!
    if (this.isBlocking && hasActiveShield(this.equipment)) {
      const blockStaminaCost = isHeavyBlow ? 28 : 14;
      if (trySpendStamina(this.stats, blockStaminaCost)) {
        const chipped = Math.max(1, Math.round(rawDmg * 0.2));
        this.stats.hp = Math.max(1, this.stats.hp - chipped);
        audioManager.playShieldBlock();
        this.addCameraTrauma(0.18);
        this.spawnFloatingText(
          this.playerRig.x,
          this.playerRig.y - 44,
          `BLOCKED (-${chipped})`,
          '#7ee8fa',
          11
        );
        return;
      } else {
        // Guard break -> Stagger state!
        this.isBlocking = false;
        this.staggerTimer = 0.65;
        this.stats.stamina = 0;
        audioManager.playStagger();
        this.addCameraTrauma(0.45);
        this.spawnFloatingText(
          this.playerRig.x,
          this.playerRig.y - 48,
          'GUARD BROKEN! (STAGGERED)',
          '#ff9e44',
          12
        );
      }
    }

    this.stats.hp = Math.max(0, this.stats.hp - rawDmg);
    this.iframeTimer = 0.35;

    if (isHeavyBlow) {
      this.staggerTimer = Math.max(this.staggerTimer, 0.48);
      audioManager.playStagger();
      this.spawnFloatingText(this.playerRig.x, this.playerRig.y - 52, 'STAGGERED!', '#ff9e44', 11);
    } else {
      this.hurtTimer = 0.22;
      audioManager.playPlayerDamage();
    }

    this.addCameraTrauma(0.42);
    this.playerRig.setTintFill(0xff4d4d);
    this.time.delayedCall(110, () => {
      this.playerRig.clearTint();
    });

    const dx = this.playerRig.x - sourceX;
    const dy = this.playerRig.y - sourceY;
    const len = Math.max(1, Math.hypot(dx, dy));
    this.playerRig.x += (dx / len) * 10;
    this.playerRig.y += (dy / len) * 8;

    this.spawnFloatingText(this.playerRig.x, this.playerRig.y - 40, `-${rawDmg}`, '#ff5c5c', 13);

    if (this.stats.hp <= 0) {
      this.handlePlayerDeath();
    }
  }

  private handlePlayerDeath(): void {
    this.playerDead = true;
    this.isBlocking = false;
    this.targetLock.lockedTargetId = null;
    this.playerRig.playState('death', true);
    this.emitToast(
      'You have fallen! Respawning at your last activated Waystone Shrine...',
      'danger'
    );

    this.time.delayedCall(1750, () => {
      this.stats.hp = getDerivedStat(this.stats, 'maxHp');
      this.stats.stamina = getDerivedStat(this.stats, 'maxStamina');
      this.playerDead = false;
      this.hurtTimer = 0;
      this.staggerTimer = 0;
      this.weaponSwitchTimer = 0;
      this.spawnPlayerAtCheckpoint(this.lastCheckpointId, true);
      this.spawnAllEnemies();
      this.snapCameraToPlayer();
      this.syncHud();
    });
  }

  private updateTargetReticle(dt: number): void {
    this.targetReticle.clear();
    const locked = this.getLockedEnemyEntity();
    if (!locked) return;

    this.reticlePulseTime += dt * 5;
    const pulse = Math.sin(this.reticlePulseTime) * 3;
    const isManual = this.targetLock.isManualLock;
    const color = isManual ? 0xffd859 : 0x54e8ff;

    const ex = locked.sprite.x;
    const ey = locked.sprite.y;
    const rx = (locked.brain.kind === 'sentinel' ? 28 : 20) + pulse;
    const ry = rx * 0.52;

    // Ground target lock ring
    this.targetReticle.lineStyle(2, color, 0.92);
    this.targetReticle.strokeEllipse(ex, ey, rx * 2, ry * 2);

    // Overhead diamond marker
    const topY = ey - (locked.brain.kind === 'sentinel' ? 76 : 56) + pulse * 0.5;
    this.targetReticle.fillStyle(color, 0.95);
    this.targetReticle.fillTriangle(ex - 5, topY - 6, ex + 5, topY - 6, ex, topY);
  }

  private updateNearestInteractable(): void {
    this.interactHighlight.clear();
    const candidates: (InteractTarget & { dist: number })[] = [];
    const INTERACT_RADIUS = 62;

    for (const cp of this.mapData.checkpoints) {
      const pos = tileToScreen(cp.tx, cp.ty, ISO_ORIGIN_X, ISO_ORIGIN_Y);
      const d = Math.hypot(this.playerRig.x - pos.x, this.playerRig.y - pos.y);
      if (d <= INTERACT_RADIUS) {
        const discovered = this.discoveredCheckpoints.has(cp.id);
        candidates.push({
          kind: 'checkpoint',
          id: cp.id,
          prompt: discovered
            ? `[E] Rest & Fast Travel — ${cp.name}`
            : `[E] Awaken ${cp.name}`,
          x: pos.x,
          y: pos.y,
          dist: d,
        });
      }
    }

    for (const rp of this.mapData.runePillars) {
      const pos = tileToScreen(rp.tx, rp.ty, ISO_ORIGIN_X, ISO_ORIGIN_Y);
      const d = Math.hypot(this.playerRig.x - pos.x, this.playerRig.y - pos.y);
      if (d <= INTERACT_RADIUS) {
        candidates.push({
          kind: 'pillar',
          id: rp.id,
          prompt: `[E] Activate ${rp.label}`,
          x: pos.x,
          y: pos.y,
          dist: d,
        });
      }
    }

    for (const ch of this.mapData.chests) {
      if (this.openedChests.has(ch.id)) continue;
      const pos = tileToScreen(ch.tx, ch.ty, ISO_ORIGIN_X, ISO_ORIGIN_Y);
      const d = Math.hypot(this.playerRig.x - pos.x, this.playerRig.y - pos.y);
      if (d <= INTERACT_RADIUS) {
        candidates.push({
          kind: 'chest',
          id: ch.id,
          prompt: `[E] Open ${ch.name}`,
          x: pos.x,
          y: pos.y,
          dist: d,
        });
      }
    }

    for (const lt of this.mapData.loreTablets) {
      const pos = tileToScreen(lt.tx, lt.ty, ISO_ORIGIN_X, ISO_ORIGIN_Y);
      const d = Math.hypot(this.playerRig.x - pos.x, this.playerRig.y - pos.y);
      if (d <= INTERACT_RADIUS) {
        candidates.push({
          kind: 'tablet',
          id: lt.id,
          prompt: `[E] Read ${lt.title}`,
          x: pos.x,
          y: pos.y,
          dist: d,
        });
      }
    }

    {
      const pos = tileToScreen(
        this.mapData.dungeonGate.tx,
        this.mapData.dungeonGate.ty,
        ISO_ORIGIN_X,
        ISO_ORIGIN_Y
      );
      const d = Math.hypot(this.playerRig.x - pos.x, this.playerRig.y - pos.y);
      if (d <= INTERACT_RADIUS + 20) {
        candidates.push({
          kind: 'dungeon_gate',
          id: 'dungeon_gate',
          prompt: '[E] Inspect Sealed Dungeon Entrance',
          x: pos.x,
          y: pos.y,
          dist: d,
        });
      }
    }

    candidates.sort((a, b) => a.dist - b.dist);
    this.nearestInteract = candidates[0] ?? null;

    if (this.nearestInteract) {
      this.interactHighlight.lineStyle(2, 0x54e8ff, 0.85);
      this.interactHighlight.strokeEllipse(
        this.nearestInteract.x,
        this.nearestInteract.y,
        44,
        22
      );
    }
  }

  private handleInteraction(): void {
    if (!this.nearestInteract) return;
    const target = this.nearestInteract;

    switch (target.kind) {
      case 'checkpoint': {
        const cp = this.mapData.checkpoints.find((c) => c.id === target.id)!;
        const wasNew = !this.discoveredCheckpoints.has(cp.id);
        this.discoveredCheckpoints.add(cp.id);
        this.lastCheckpointId = cp.id;

        const sprite = this.waystoneSprites.get(cp.id);
        if (sprite && sprite.anims.currentAnim?.key !== 'waystone-active') {
          sprite.play('waystone-active');
        }

        this.stats.hp = getDerivedStat(this.stats, 'maxHp');
        this.stats.stamina = getDerivedStat(this.stats, 'maxStamina');
        audioManager.playCheckpointActivate();
        this.persistProgress();

        this.emitToast(
          wasNew
            ? `Discovered & Activated ${cp.name}! Health and Stamina restored.`
            : `Rested at ${cp.name}. Health and Stamina restored.`,
          'success'
        );

        eventBus.emit('ui:openCheckpointModal', {
          currentId: cp.id,
          checkpoints: this.buildCheckpointUiList(cp.id),
        });
        break;
      }

      case 'pillar': {
        const rp = this.mapData.runePillars.find((p) => p.id === target.id)!;
        const res = activateRunePillar(this.puzzle, rp.rune);
        this.refreshRunePillarSprites();

        if (res.status === 'progressed') {
          audioManager.playPuzzleStep(res.stepIndex);
          this.emitToast(res.message, 'info');
        } else if (res.status === 'solved') {
          audioManager.playPuzzleSolved();
          this.addCameraTrauma(0.5);
          this.vaultDoorSprite.setFrame(1);
          if (this.vaultDoorCollider) {
            this.vaultDoorCollider.enable = false;
          }
          grantExperience(this.stats, 75);
          this.spawnFloatingText(this.playerRig.x, this.playerRig.y - 48, '+75 XP', '#54e8ff', 13);
          this.emitToast(res.message, 'success');
          this.persistProgress();
        } else if (res.status === 'reset') {
          audioManager.playPuzzleFail();
          this.addCameraTrauma(0.28);
          this.emitToast(res.message, 'warning');
        } else {
          this.emitToast(res.message, 'info');
        }
        break;
      }

      case 'chest': {
        const ch = this.mapData.chests.find((c) => c.id === target.id)!;
        this.openedChests.add(ch.id);
        this.chestSprites.get(ch.id)?.setFrame(1);
        audioManager.playCheckpointActivate();

        const rewardNames: string[] = [];
        for (const r of ch.rewards) {
          addItem(this.inventory, r.itemId, r.quantity);
          rewardNames.push(`${ITEM_CATALOG[r.itemId].name} x${r.quantity}`);
        }
        const xpRes = grantExperience(this.stats, ch.xpReward);
        this.spawnFloatingText(target.x, target.y - 36, `+${ch.xpReward} XP`, '#ffd859', 12);
        this.emitToast(
          `Opened ${ch.name}: Found ${rewardNames.join(', ')} (+${ch.xpReward} XP)!`,
          'success'
        );
        if (xpRes.leveledUp) {
          audioManager.playLevelUp();
          this.triggerLevelUpVfx();
        }
        this.persistProgress();
        break;
      }

      case 'tablet': {
        const lt = this.mapData.loreTablets.find((t) => t.id === target.id)!;
        eventBus.emit('ui:loreModal', {
          title: lt.title,
          inscription: lt.inscription,
        });
        break;
      }

      case 'dungeon_gate': {
        if (!this.sentinelDefeated) {
          this.emitToast(
            'The Dungeon Gate is bound by an active guardian seal! Defeat the Moss-Stone Sentinel first.',
            'warning'
          );
        } else if (getItemCount(this.inventory, 'sunstone_relic') > 0) {
          eventBus.emit('ui:loreModal', {
            title: 'Catacombs of Aethelgard — Area Complete!',
            inscription:
              'With both the [Sentinel’s Amber Core] and the [Sunstone Relic] in your possession, the ancient Dungeon Seal resonates! You have conquered all challenges of the Enchanted Forest prototype slice.',
          });
        } else {
          this.emitToast(
            'The Sentinel is vanquished! Solve the Sunken Temple 3-Rune Pillar puzzle to claim the Sunstone Relic.',
            'info'
          );
        }
        break;
      }
    }
  }

  private refreshRunePillarSprites(): void {
    for (const rp of this.mapData.runePillars) {
      const baseFrame = rp.rune === 'moon' ? 0 : rp.rune === 'sun' ? 2 : 4;
      const isLit = this.puzzle.solved || this.puzzle.activatedOrder.includes(rp.rune);
      this.pillarSprites.get(rp.id)?.setFrame(isLit ? baseFrame + 1 : baseFrame);
    }
  }

  private consumeItem(itemId: ItemId): void {
    const res = useInventoryItem(this.inventory, this.stats, itemId);
    if (res.success) {
      audioManager.playPotionDrink();
      const label = res.hpDelta > 0 ? `+${res.hpDelta} HP` : `+${res.staminaDelta} STAM`;
      const color = res.hpDelta > 0 ? '#68f58c' : '#54e8ff';
      this.spawnFloatingText(this.playerRig.x, this.playerRig.y - 42, label, color, 12);
      this.emitToast(res.message, 'success');
      this.persistProgress();
    } else {
      audioManager.playLowStaminaClick();
      this.emitToast(res.message, 'warning');
    }
    this.syncHud();
  }

  private teleportToCheckpoint(checkpointId: string): void {
    if (!this.discoveredCheckpoints.has(checkpointId)) return;
    this.lastCheckpointId = checkpointId;
    this.targetLock.lockedTargetId = null;
    audioManager.playCheckpointActivate();
    this.spawnPlayerAtCheckpoint(checkpointId, true);
    this.snapCameraToPlayer();
    const cp = this.mapData.checkpoints.find((c) => c.id === checkpointId);
    if (cp) {
      this.emitToast(`Teleported to ${cp.name}.`, 'info');
    }
    this.persistProgress();
    this.syncHud();
  }

  private snapCameraToPlayer(): void {
    this.camFocus.x = this.playerRig.x;
    this.camFocus.y = this.playerRig.y - 14;
    this.camLookAhead.x = 0;
    this.camLookAhead.y = 0;
    this.cameras.main.centerOn(this.camFocus.x, this.camFocus.y);
  }

  private updateCamera(realDt: number): void {
    if (!this.playerRig) return;
    const body = this.playerRig.body;
    const velLen = Math.hypot(body.velocity.x, body.velocity.y);
    const goalLeadX = velLen > 5 ? (body.velocity.x / velLen) * 24 : 0;
    const goalLeadY = velLen > 5 ? (body.velocity.y / velLen) * 16 : 0;

    const leadT = 1 - Math.exp(-5 * realDt);
    this.camLookAhead.x = Phaser.Math.Linear(this.camLookAhead.x, goalLeadX, leadT);
    this.camLookAhead.y = Phaser.Math.Linear(this.camLookAhead.y, goalLeadY, leadT);

    const targetX = this.playerRig.x + this.camLookAhead.x;
    const targetY = this.playerRig.y - 14 + this.camLookAhead.y;

    const followT = 1 - Math.exp(-10 * realDt);
    this.camFocus.x = Phaser.Math.Linear(this.camFocus.x, targetX, followT);
    this.camFocus.y = Phaser.Math.Linear(this.camFocus.y, targetY, followT);

    let shakeX = 0;
    let shakeY = 0;
    if (this.trauma > 0) {
      this.trauma = Math.max(0, this.trauma - 1.45 * realDt);
      const strength = this.reduceShake ? 0.2 : 1.0;
      const shake = this.trauma * this.trauma * strength;
      this.shakeTime += realDt * 34;
      shakeX = Math.sin(this.shakeTime * 1.7) * 10 * shake;
      shakeY = Math.sin(this.shakeTime * 2.3) * 7 * shake;
    }

    this.cameras.main.centerOn(
      Math.round(this.camFocus.x + shakeX),
      Math.round(this.camFocus.y + shakeY)
    );
  }

  private addCameraTrauma(amount: number): void {
    this.trauma = Math.min(1.0, this.trauma + amount);
  }

  private updateZoneCheck(): void {
    const tile = screenToTile(this.playerRig.x, this.playerRig.y, ISO_ORIGIN_X, ISO_ORIGIN_Y);
    const tx = Math.round(tile.x);
    const ty = Math.round(tile.y);

    for (const z of this.mapData.zones) {
      if (tx >= z.minTx && tx <= z.maxTx && ty >= z.minTy && ty <= z.maxTy) {
        if (this.currentZoneId !== z.id) {
          this.currentZoneId = z.id;
          eventBus.emit('ui:zoneBanner', { name: z.name, subtitle: z.subtitle });
        }
        return;
      }
    }
  }

  private notifyInsufficientStamina(): void {
    this.staminaInsufficientPulse = Date.now();
    audioManager.playLowStaminaClick();
    this.spawnFloatingText(this.playerRig.x, this.playerRig.y - 44, 'LOW STAMINA', '#ff9e44', 10);
  }

  private triggerLevelUpVfx(): void {
    const ring = this.add.ellipse(this.playerRig.x, this.playerRig.y, 64, 34, 0xfcda66, 0.55);
    ring.setDepth(this.playerRig.y + 10);
    this.tweens.add({
      targets: ring,
      scale: 2.1,
      alpha: 0,
      duration: 550,
      onComplete: () => ring.destroy(),
    });
    this.spawnFloatingText(
      this.playerRig.x,
      this.playerRig.y - 56,
      `LEVEL UP! (Lv.${this.stats.level})`,
      '#ffd859',
      15
    );
  }

  private spawnFloatingText(
    x: number,
    y: number,
    text: string,
    color: string,
    fontSize = 12
  ): void {
    const label = this.add.text(x, y, text, {
      fontFamily: 'Silkscreen, monospace',
      fontSize: `${fontSize}px`,
      color,
      stroke: '#12101a',
      strokeThickness: 3,
    });
    label.setOrigin(0.5, 0.5);
    label.setDepth(9500);
    this.tweens.add({
      targets: label,
      y: y - 24,
      alpha: 0,
      duration: 720,
      ease: 'Cubic.Out',
      onComplete: () => label.destroy(),
    });
  }

  private emitToast(
    text: string,
    tone: 'info' | 'success' | 'warning' | 'danger' | 'lore' = 'info'
  ): void {
    eventBus.emit('ui:toast', { id: this.toastCounter++, text, tone });
  }

  private buildCheckpointUiList(currentId = this.lastCheckpointId): CheckpointUiEntry[] {
    return this.mapData.checkpoints.map((c: CheckpointPlacement) => ({
      id: c.id,
      name: c.name,
      subtitle: c.subtitle,
      discovered: this.discoveredCheckpoints.has(c.id),
      isCurrent: c.id === currentId,
    }));
  }

  private persistProgress(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    saveGameState(window.localStorage, {
      version: SAVE_VERSION,
      player: {
        level: this.stats.level,
        xp: this.stats.xp,
        hp: Math.round(this.stats.hp),
        stamina: Math.round(this.stats.stamina),
        baseMaxHp: this.stats.baseMaxHp,
        baseMaxStamina: this.stats.baseMaxStamina,
        baseAttack: this.stats.baseAttack,
        baseDefense: this.stats.baseDefense,
      },
      inventory: this.inventory.slots,
      equipment: {
        equipped: { ...this.equipment.equipped },
        storedShieldId: this.equipment.storedShieldId,
        alternateWeaponId: this.equipment.alternateWeaponId,
      },
      keybindings: { ...this.keybindings },
      world: {
        discoveredCheckpoints: Array.from(this.discoveredCheckpoints),
        lastCheckpointId: this.lastCheckpointId,
        puzzleSolved: this.puzzle.solved,
        openedChests: Array.from(this.openedChests),
        sentinelDefeated: this.sentinelDefeated,
      },
    });
  }

  private syncHud(): void {
    const currentZoneObj =
      this.mapData.zones.find((z) => z.id === this.currentZoneId) ?? this.mapData.zones[0];

    const sentinelEntity = this.enemies.find(
      (e) => e.brain.kind === 'sentinel' && e.brain.state !== 'dead'
    );
    const showBossHud =
      sentinelEntity &&
      (sentinelEntity.brain.hp < sentinelEntity.brain.maxHp ||
        Math.hypot(
          this.playerRig.x - sentinelEntity.sprite.x,
          this.playerRig.y - sentinelEntity.sprite.y
        ) < 280);

    const lockedEntity = this.getLockedEnemyEntity();
    const locks = this.getCombatActionLocks();

    eventBus.emit('hud:update', {
      level: this.stats.level,
      xp: this.stats.xp,
      xpToNext: this.stats.xpToNext,
      hp: Math.round(this.stats.hp),
      maxHp: getDerivedStat(this.stats, 'maxHp'),
      stamina: Math.round(this.stats.stamina),
      maxStamina: getDerivedStat(this.stats, 'maxStamina'),
      attack: getDerivedStat(this.stats, 'attack'),
      defense: getDerivedStat(this.stats, 'defense'),
      critChancePct: Math.round(getDerivedStat(this.stats, 'critChance') * 100),
      facing: this.facing,
      inventory: this.inventory.slots.map((s) => ({ ...s })),
      inventoryCapacity: this.inventory.capacity,
      equipment: {
        equipped: { ...this.equipment.equipped },
        ownedEquipmentIds: [...this.equipment.ownedEquipmentIds],
        storedShieldId: this.equipment.storedShieldId,
        alternateWeaponId: this.equipment.alternateWeaponId,
      },
      activeWeaponKind: getActiveWeaponKind(this.equipment),
      hasShield: hasActiveShield(this.equipment),
      combatState: {
        ...locks,
        canSwitchWeapon: canSwitchWeapon(locks).allowed,
      },
      lockedTarget: lockedEntity
        ? {
            id: lockedEntity.brain.id,
            name: ENEMY_ARCHETYPES[lockedEntity.brain.kind].name,
            hp: lockedEntity.brain.hp,
            maxHp: lockedEntity.brain.maxHp,
            isElite: ENEMY_ARCHETYPES[lockedEntity.brain.kind].isElite,
            isManual: this.targetLock.isManualLock,
            distance: Math.round(
              Math.hypot(
                lockedEntity.sprite.x - this.playerRig.x,
                lockedEntity.sprite.y - this.playerRig.y
              )
            ),
          }
        : null,
      keybindings: { ...this.keybindings },
      quickPotions: {
        healthCount: getItemCount(this.inventory, 'health_potion'),
        staminaCount: getItemCount(this.inventory, 'stamina_potion'),
      },
      arcaneCooldown: Number(this.arcaneCooldownTimer.toFixed(1)),
      arcaneMaxCooldown: ARCANE_MAX_COOLDOWN,
      interactionPrompt: this.nearestInteract?.prompt ?? null,
      currentZone: {
        name: currentZoneObj.name,
        subtitle: currentZoneObj.subtitle,
      },
      puzzleProgress: this.puzzle.activatedOrder.length,
      puzzleSolved: this.puzzle.solved,
      sentinelDefeated: this.sentinelDefeated,
      bossInfo:
        showBossHud && sentinelEntity
          ? {
              name: 'Moss-Stone Sentinel — Ancient Gate Warden',
              hp: sentinelEntity.brain.hp,
              maxHp: sentinelEntity.brain.maxHp,
            }
          : null,
      checkpoints: this.buildCheckpointUiList(),
      staminaInsufficientPulse: this.staminaInsufficientPulse,
    });
  }
}
