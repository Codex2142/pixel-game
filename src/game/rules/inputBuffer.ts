export type BufferedAction = 'attack' | 'dodge' | 'magic';

/**
 * Remembers discrete combat presses briefly in game time so presses during recovery or hit-stop
 * fire on the first legal tick (input-systems skill Pattern 3).
 */
export class ActionBuffer {
  private readonly windowSeconds: number;
  private readonly pressedAt = new Map<BufferedAction, number>();

  constructor(windowSeconds = 0.16) {
    this.windowSeconds = windowSeconds;
  }

  press(action: BufferedAction, gameClockSeconds: number): void {
    this.pressedAt.set(action, gameClockSeconds);
  }

  consume(action: BufferedAction, gameClockSeconds: number): boolean {
    const t = this.pressedAt.get(action);
    if (t === undefined) return false;
    if (gameClockSeconds - t > this.windowSeconds) {
      this.pressedAt.delete(action);
      return false;
    }
    this.pressedAt.delete(action);
    return true;
  }

  clear(): void {
    this.pressedAt.clear();
  }
}
