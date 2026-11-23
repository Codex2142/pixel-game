# Vale of Aethelgard — 2D Isometric Medieval Fantasy Action RPG Prototype

An early playable vertical slice of a **2D Isometric Medieval Fantasy Action RPG** running directly in a desktop web browser, built with **React, TypeScript, Vite, Phaser 3.90, and CSS**.

---

## 1. Installation & Local Development Instructions

### Prerequisites
- **Node.js** `>= 20` (tested on Node `v26.8.1`) and **npm** `>= 10`.

### Quick Start
```bash
# 1. Install dependencies
npm install

# 2. (Optional) Regenerate deterministic pixel-art assets & run raster QA
npm run generate-assets

# 3. Run unit tests (pure RPG rules, puzzle, AI FSM, save recovery, map reachability)
npm test

# 4. Start the local development server
npm run dev
```

Then open **`http://localhost:5173`** in your desktop browser.

### Production Build
```bash
npm run build
npm run preview
```

---

## 2. Project Structure

```text
/Users/akbarsadat/Developers/pixel-game/
├── index.html                        # Entry HTML with pixel-art fonts
├── package.json                      # Dependencies & scripts
├── tsconfig.json                     # Strict TypeScript configuration
├── vite.config.ts                    # Vite development & bundler configuration
├── scripts/
│   └── generate-assets.mjs           # Deterministic 32-color 2:1 isometric pixel-art generator + QA
├── public/
│   └── assets/                       # 35 generated RGBA PNG tiles, props, spritesheets, icons & manifest
├── src/
│   ├── main.tsx                      # React root mount
│   ├── App.tsx                       # Phaser lifecycle manager & UI modal stack
│   ├── styles/
│   │   └── rpg.css                   # Restrained classic pixel-art HUD & modal styling
│   ├── ui/
│   │   ├── Hud.tsx                   # HP/Stamina/XP bars, quick slots, zone banner, boss bar, prompts
│   │   ├── InventoryModal.tsx        # 12-slot backpack, consumable usage, quest item inspection
│   │   ├── CheckpointModal.tsx       # Waystone Shrine discovery & fast-travel teleportation
│   │   ├──LoreModal.tsx              # Engraved stele lore & puzzle clue reader
│   │   └── PauseModal.tsx            # Controls, dB audio sliders, reduce-shake toggle, save reset
│   └── game/
│       ├── createGame.ts             # Phaser 3.90 configuration (pixelArt: true, Arcade Physics)
│       ├── audio/
│       │   └── AudioManager.ts       # Web Audio API procedural SFX & forest ambience bus mixer
│       ├── bridge/
│       │   └── EventBus.ts           # Typed pub/sub bridge decoupling Phaser and React
│       ├── scenes/
│       │   ├── BootScene.ts          # Asset preloader & sprite animation registry
│       │   └── ForestScene.ts        # Isometric world renderer, camera, combat, AI & interactions
│       ├── world/
│       │   └── enchantedForestMap.ts # 56x56 Enchanted Forest data, 7 zones, landmarks & collisions
│       └── rules/                    # Pure TypeScript simulation rules (zero Phaser imports)
│           ├── iso.ts                # 2:1 isometric coordinate projection & 8-way velocity mapping
│           ├── stats.ts              # Base stats + modifier stack, ratio damage, stamina & XP curve
│           ├── inventory.ts          # Item catalog, stack limits, consumable vs quest item guards
│           ├── puzzle.ts             # Sunken Temple 3-Rune Pillar (Moon -> Sun -> Star) state machine
│           ├── ai.ts                 # Layered Enemy FSM (Goblin Scout & Moss-Stone Sentinel)
│           ├── inputBuffer.ts        # Game-time discrete action buffer (attack, dodge, magic)
│           ├── saveSystem.ts         # Versioned localStorage save with atomic .bak fallback
│           └── __tests__/
│               └── rules.test.ts     # Automated headless unit & level-reachability test suite
```

---

## 3. Controls (Configurable in Pause Menu)

| Input | Action | Details |
| :--- | :--- | :--- |
| **`W / A / S / D`** or **Arrow Keys** | 8-Directional Isometric Movement | Smooth movement across all 8 directions (`S, SW, W, NW, N, NE, E, SE`) |
| **`Left Mouse Click`** or **`J`** | Main-Hand Weapon Attack | Auto-acquires target or aims at cursor (`14` Stamina Dagger / `26` Stamina Greatsword) |
| **`Right Mouse Click`** or **`Q`** | Arcane Bolt (Magic) | Ranged arcane projectile (`24` Stamina, `3.5s` Cooldown) |
| **`Spacebar`** | Directional Dodge | High-speed dash with `0.23s` invulnerability frames (`25` Stamina) |
| **`T`** (or **`TAB`**, configurable) | Toggle Hybrid Target Lock | Manually lock/unlock nearby enemy within targeting range |
| **`C` / `V`** (configurable) | Switch Locked Target | Deterministically cycle locked target Left (`C`) or Right (`V`) |
| **`X`** (configurable) | Conditional Weapon Switch | Swap between **Rondel Dagger (1H + Shield)** and **Aethelgard Claymore (2H Greatsword)** when not attacking/hurt/staggered |
| **`Shift`** (configurable) | Shield Guard Block | Hold to raise Heraldic Kite Shield (requires Dagger + Shield equipped; reduces damage by 80%) |
| **`E`** | Interact | Activate Waystones, Rune Pillars, Treasure Chests, Lore Tablets |
| **`1` / `2`** | Quick Consumables | Drink Health Potion (`+50 HP`) / Stamina Potion (`+65 Stamina`) |
| **`I`** | Modular Gear & Satchel | Open 8-Slot Modular Equipment Loadout & 12-Slot Item Satchel |
| **`ESC`** | Pause / Keybind Config | Configure keybindings, audio bus sliders, reduce-shake toggle, or reset save |

---

## 4. Implemented Gameplay Systems

1. **Cohesive 2:1 Isometric Pixel-Art Presentation**:
   - Locked 32-color high-fantasy medieval palette with 3D tile cliff bevels, top-left directional lighting, 1px dark outlines, soft ground shadows, animated water shimmer, flickering campfires, drifting golden canopy motes, and Y-coordinate depth sorting (`sprite.setDepth(sprite.y)`).
2. **Enchanted Forest Area (`56×56` Isometric Tiles, 7 Landmarks)**:
   - *Sunlit Glade* (Start & Glade Waystone), *Whispering Trail & Briargrove*, *Crystal Brook & Timber Bridge* (+ northern stepping-stone ford), *Abandoned Ranger Outpost* (lore clue), *Sunken Temple Ruins & Hidden Sunstone Vault*, *Deep Grove Sanctuary* (Elder Waystone), and *Sealed Ancient Dungeon Gate*.
3. **Smooth Follow Camera & Game Feel**:
   - Frame-rate-independent exponential smoothing (`1 - exp(-rate * dt)`), velocity look-ahead, world-bound clamping, hard-cut teleport snap, trauma-based screen shake (`trauma²`), real-time hit-stop (`45ms`), white/gold hit flashes, knockback, and floating combat numbers.
4. **Stamina-Driven Real-Time Combat & Magic**:
   - Sword combo slashes, directional i-frame dodge with cobalt afterimages, and **Arcane Bolt** ranged magic share a central Stamina resource (`100` base, `0.62s` post-action delay, `30/s` regeneration).
5. **Distinct Enemy Archetypes & Hysteresis FSM**:
   - **Goblin Scout** (basic nimble patrol/lunge) and **Moss-Stone Sentinel** (elite ruin warden with a telegraphed ground-slam AoE warning ring and boss HUD health bar).
6. **Exploration Puzzle & Checkpoints**:
   - Decipher the Ranger Outpost tablet to activate the three Sunken Temple mechanisms in order (**Moon → Sun → Star**), unsealing the Hidden Treasure Vault containing the *Sunstone Relic*.
   - Awaken two Waystone Shrines to heal, save progress to `localStorage`, and fast-travel between discovered shrines.

---

## 5. Known Prototype Limitations

- **Single Playable Area**: Only the *Enchanted Forest* area is implemented; the *Sealed Dungeon Gate* serves as the vertical-slice finale milestone after defeating the Moss-Stone Sentinel and recovering the Sunstone Relic.
- **Fixed Protagonist & Equipment**: Sir Aldric uses a fixed broadsword and cobalt ranger-knight visual appearance without equipment paper-doll swapping.
- **Procedural Web Audio**: Audio feedback and woodland ambience are synthesized in real time via the Web Audio API rather than streamed from external `.ogg`/`.wav` recordings.
- **Single-Slot Local Persistence**: Progress is persisted locally in browser `localStorage` (`aethelgard_arpg_save_v1` + `.bak` backup) without cloud sync.
