import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.ts';
import { ForestScene } from './scenes/ForestScene.ts';

export function createPhaserGame(parentElement: HTMLElement): Phaser.Game {
  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent: parentElement,
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: '#11161b',
    pixelArt: true,
    roundPixels: true,
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { x: 0, y: 0 },
        debug: false,
      },
    },
    scene: [BootScene, ForestScene],
  };

  const game = new Phaser.Game(config);
  Object.assign(window, { game });
  return game;
}
