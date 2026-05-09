import type { ScoringSystem } from './types.js';

/**
 * Default FIDE scoring system. Color-specific values are omitted — consumers
 * fall back to the base values (e.g. `whiteWin ?? win ?? 1`).
 */
const FIDE_SCORING: ScoringSystem = {
  absence: 0,
  draw: 0.5,
  forfeitLoss: 0,
  forfeitWin: 1,
  fullPointBye: 1,
  halfPointBye: 0.5,
  loss: 0,
  pairingAllocatedBye: 1,
  win: 1,
  zeroPointBye: 0,
};

export { FIDE_SCORING };
