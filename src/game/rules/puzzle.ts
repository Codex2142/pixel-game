export type RuneId = 'moon' | 'sun' | 'star';

export const CORRECT_RUNE_ORDER: readonly RuneId[] = ['moon', 'sun', 'star'] as const;

export interface RuinPuzzleState {
  activatedOrder: RuneId[];
  solved: boolean;
  attempts: number;
}

export function createInitialPuzzleState(): RuinPuzzleState {
  return {
    activatedOrder: [],
    solved: false,
    attempts: 0,
  };
}

export interface PillarActivationResult {
  status: 'already_solved' | 'already_lit' | 'progressed' | 'solved' | 'reset';
  stepIndex: number; // 0, 1, or 2 for musical chime pitch
  message: string;
}

export function activateRunePillar(
  state: RuinPuzzleState,
  rune: RuneId
): PillarActivationResult {
  if (state.solved) {
    return {
      status: 'already_solved',
      stepIndex: 2,
      message: 'The ancient mechanism has already unsealed the Hidden Vault.',
    };
  }

  if (state.activatedOrder.includes(rune)) {
    return {
      status: 'already_lit',
      stepIndex: state.activatedOrder.indexOf(rune),
      message: `The ${rune.toUpperCase()} Pillar is already resonating.`,
    };
  }

  const nextExpected = CORRECT_RUNE_ORDER[state.activatedOrder.length];
  if (rune === nextExpected) {
    state.activatedOrder.push(rune);
    const stepIndex = state.activatedOrder.length - 1;
    if (state.activatedOrder.length === CORRECT_RUNE_ORDER.length) {
      state.solved = true;
      state.attempts += 1;
      return {
        status: 'solved',
        stepIndex: 2,
        message: 'Moon, Sun, and Star align! The Hidden Temple Vault unseals to the northeast!',
      };
    }
    return {
      status: 'progressed',
      stepIndex,
      message: `The ${rune.toUpperCase()} Pillar ignites with harmonic resonance (${state.activatedOrder.length}/3).`,
    };
  }

  // Wrong order -> reset mechanism
  state.activatedOrder = [];
  state.attempts += 1;
  return {
    status: 'reset',
    stepIndex: 0,
    message: 'Dissonant rumble! The runes fade — recall the Outpost Tablet: "First silver Moon, then golden Sun, last the eternal Star."',
  };
}
