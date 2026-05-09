import { FIDE_SCORING } from './scoring.js';

import type {
  AccelerationMethod,
  Bye,
  CompletedRound,
  Game,
  Pairing,
  PairingSystem,
  Pairings,
  Player,
  PointAdjustment,
  Round,
  ScoringSystem,
  Standing,
  Tiebreak,
  TournamentData,
} from './types.js';

/** Hardcoded FIDE defaults for scoring fallback chains. */
const DEFAULT_WIN = 1;
const DEFAULT_DRAW = 0.5;
const DEFAULT_LOSS = 0;
const DEFAULT_FORFEIT_WIN = 1;
const DEFAULT_FORFEIT_LOSS = 0;
const DEFAULT_FULL_BYE = 1;
const DEFAULT_HALF_BYE = 0.5;
const DEFAULT_PAIRING_BYE = 1;
const DEFAULT_ZERO_BYE = 0;

/**
 * Returns the score for a single game from the perspective of the given color.
 */
function scoreForGame(
  game: Game,
  color: 'black' | 'white',
  scoring: ScoringSystem,
): number {
  const hasForfeit = 'forfeit' in game && game.forfeit !== undefined;

  if (hasForfeit) {
    if (game.result === 'none') {
      return scoring.forfeitLoss ?? DEFAULT_FORFEIT_LOSS;
    }
    if (game.result === color) {
      return scoring.forfeitWin ?? DEFAULT_FORFEIT_WIN;
    }
    return scoring.forfeitLoss ?? DEFAULT_FORFEIT_LOSS;
  }

  if (game.result === 'draw') {
    if (color === 'white') {
      return scoring.whiteDraw ?? scoring.draw ?? DEFAULT_DRAW;
    }
    return scoring.blackDraw ?? scoring.draw ?? DEFAULT_DRAW;
  }

  if (game.result === color) {
    if (color === 'white') {
      return scoring.whiteWin ?? scoring.win ?? DEFAULT_WIN;
    }
    return scoring.blackWin ?? scoring.win ?? DEFAULT_WIN;
  }

  // loss
  if (color === 'white') {
    return scoring.whiteLoss ?? scoring.loss ?? DEFAULT_LOSS;
  }
  return scoring.blackLoss ?? scoring.loss ?? DEFAULT_LOSS;
}

/**
 * Returns the score for a bye based on its kind and the scoring system.
 */
function scoreForBye(bye: Bye, scoring: ScoringSystem): number {
  switch (bye.kind) {
    case 'full': {
      return scoring.fullPointBye ?? DEFAULT_FULL_BYE;
    }
    case 'half': {
      return scoring.halfPointBye ?? DEFAULT_HALF_BYE;
    }
    case 'pairing': {
      return scoring.pairingAllocatedBye ?? DEFAULT_PAIRING_BYE;
    }
    case 'zero': {
      return scoring.zeroPointBye ?? DEFAULT_ZERO_BYE;
    }
  }
}

/**
 * Checks if a pairing entry is a completed game (has a result string).
 */
function isGame(entry: Game | Pairing): entry is Game {
  return 'result' in entry && typeof (entry as Game).result === 'string';
}

/**
 * Stateful chess tournament orchestrator. Drives any pairing system through a
 * common lifecycle: create, pair, record results, standings, repeat.
 *
 * Follows the `PositionData` / `Position` pattern: `TournamentData` is the
 * plain data interface, `Tournament` is the class that wraps it.
 *
 * @example
 * ```typescript
 * import { Tournament } from '@echecs/tournament';
 * import { dutch } from '@echecs/swiss';
 *
 * const t = new Tournament(
 *   {
 *     completedRounds: [],
 *     players: [
 *       { id: 'alice', points: 0, rank: 1 },
 *       { id: 'bob', points: 0, rank: 2 },
 *       { id: 'carol', points: 0, rank: 3 },
 *       { id: 'dave', points: 0, rank: 4 },
 *     ],
 *     totalRounds: 3,
 *   },
 *   { pairingSystem: dutch },
 * );
 *
 * const r1 = t.pair();
 * // record results...
 * const standings = t.standings();
 * ```
 */
class Tournament {
  #completedRounds: CompletedRound[];
  #currentRound?: Round;
  #data: TournamentData;
  readonly #onWarning?: (message: string) => void;
  readonly #pairingSystem: PairingSystem;
  readonly #tiebreakFns: Tiebreak[];
  readonly #withdrawn: Set<string>;

  /**
   * Creates a new tournament.
   *
   * @param data - Tournament data.
   * @param options - Pairing system and optional acceleration method.
   */
  constructor(
    data: TournamentData,
    options: {
      acceleration?: AccelerationMethod;
      onWarning?: (message: string) => void;
      pairingSystem: PairingSystem;
      tiebreaks?: Record<string, Tiebreak>;
    },
  ) {
    this.#completedRounds = data.completedRounds.map((r) => ({
      ...r,
      games: [...r.games],
    }));
    this.#currentRound = data.currentRound
      ? { ...data.currentRound, games: [...data.currentRound.games] }
      : undefined;
    this.#data = { ...data };
    this.#onWarning = options.onWarning;
    this.#pairingSystem = options.pairingSystem;

    this.#withdrawn = new Set<string>();

    // Resolve tiebreak IDs to functions
    const tiebreakIds = data.tiebreaks ?? [];
    const registry = options.tiebreaks ?? {};
    this.#tiebreakFns = [];
    for (const id of tiebreakIds) {
      const function_ = registry[id];
      if (function_) {
        this.#tiebreakFns.push(function_);
      } else if (this.#onWarning) {
        this.#onWarning(
          `tiebreak "${id}" is declared in tournament data but has no registered function. pass it in the tiebreaks option to enable it.`,
        );
      }
    }
  }

  #addComment(comment: string): void {
    if (!this.#data.metadata) {
      this.#data.metadata = {};
    }
    if (!this.#data.metadata.comments) {
      this.#data.metadata.comments = [];
    }
    this.#data.metadata.comments.push(comment);
  }

  #findGameIndex(
    games: readonly (Game | Pairing)[],
    white: string,
    black: string,
  ): number {
    return games.findIndex(
      (g) =>
        (g.white === white && g.black === black) ||
        (g.white === black && g.black === white),
    );
  }

  #findPlayer(id: string): Player | undefined {
    return this.#data.players.find((p) => p.id === id);
  }

  /**
   * Adds a point adjustment (penalty, bonus). Affects standings.
   * Logs a comment in metadata.
   */
  adjust(adjustment: PointAdjustment): void {
    if (!this.#data.adjustments) {
      this.#data.adjustments = [];
    }
    this.#data.adjustments.push(adjustment);
    const player = this.#findPlayer(adjustment.playerId);
    if (player) {
      player.points += adjustment.points;
    }
    this.#addComment(
      `point adjustment: ${adjustment.points > 0 ? '+' : ''}${adjustment.points} for ${adjustment.playerId}${adjustment.reason ? ` (${adjustment.reason})` : ''}`,
    );
  }

  /**
   * Removes a result, reverting a game back to a pairing.
   *
   * @param round - The 1-based round number.
   * @param white - Player identifier for white.
   * @param black - Player identifier for black.
   * @throws {RangeError} If the round is invalid or no matching game exists.
   */
  clear(round: number, white: string, black: string): void {
    if (round < 1) {
      throw new RangeError('invalid round number');
    }

    const scoring = this.#data.scoringSystem ?? FIDE_SCORING;

    // Current round
    if (this.#currentRound && round === this.#completedRounds.length + 1) {
      const index = this.#findGameIndex(this.#currentRound.games, white, black);
      const entry = index >= 0 ? this.#currentRound.games[index] : undefined;
      if (index === -1 || !entry || !isGame(entry)) {
        throw new RangeError(
          `no game found for ${white} vs ${black} in round ${round}`,
        );
      }
      const whitePlayer = this.#findPlayer(entry.white);
      const blackPlayer = this.#findPlayer(entry.black);
      if (whitePlayer) {
        whitePlayer.points -= scoreForGame(entry, 'white', scoring);
      }
      if (blackPlayer) {
        blackPlayer.points -= scoreForGame(entry, 'black', scoring);
      }
      this.#currentRound.games[index] = {
        black: entry.black,
        white: entry.white,
      };
      return;
    }

    // Completed round
    const completedRound = this.#completedRounds[round - 1];
    if (!completedRound) {
      throw new RangeError('invalid round number');
    }
    const index = this.#findGameIndex(completedRound.games, white, black);
    const existing = index >= 0 ? completedRound.games[index] : undefined;
    if (index === -1 || !existing) {
      throw new RangeError(
        `no game found for ${white} vs ${black} in round ${round}`,
      );
    }
    if (isGame(existing)) {
      const whitePlayer = this.#findPlayer(existing.white);
      const blackPlayer = this.#findPlayer(existing.black);
      if (whitePlayer) {
        whitePlayer.points -= scoreForGame(existing, 'white', scoring);
      }
      if (blackPlayer) {
        blackPlayer.points -= scoreForGame(existing, 'black', scoring);
      }
    }
    (completedRound.games as (Game | Pairing)[])[index] = {
      black: existing.black,
      white: existing.white,
    };
  }

  /**
   * Corrects a result in any round (including completed). Logs a comment.
   * Handles adjourned games (FIDE C.04.2 Art 3.1).
   *
   * @param round - The 1-based round number.
   * @param game - The corrected game result.
   * @throws {RangeError} If the round is invalid or no matching pairing exists.
   */
  correct(round: number, game: Game): void {
    if (round < 1) {
      throw new RangeError('invalid round number');
    }

    const scoring = this.#data.scoringSystem ?? FIDE_SCORING;

    // Current round
    if (this.#currentRound && round === this.#completedRounds.length + 1) {
      const index = this.#findGameIndex(
        this.#currentRound.games,
        game.white,
        game.black,
      );
      const existing = index >= 0 ? this.#currentRound.games[index] : undefined;
      if (index === -1 || !existing) {
        throw new RangeError(
          `no pairing found for ${game.white} vs ${game.black} in round ${round}`,
        );
      }
      if (isGame(existing)) {
        const whitePlayer = this.#findPlayer(existing.white);
        const blackPlayer = this.#findPlayer(existing.black);
        if (whitePlayer) {
          whitePlayer.points -= scoreForGame(existing, 'white', scoring);
        }
        if (blackPlayer) {
          blackPlayer.points -= scoreForGame(existing, 'black', scoring);
        }
      }
      const corrected: Game = {
        ...game,
        black: existing.black,
        white: existing.white,
      };
      this.#currentRound.games[index] = corrected;
      const whitePlayer = this.#findPlayer(corrected.white);
      const blackPlayer = this.#findPlayer(corrected.black);
      if (whitePlayer) {
        whitePlayer.points += scoreForGame(corrected, 'white', scoring);
      }
      if (blackPlayer) {
        blackPlayer.points += scoreForGame(corrected, 'black', scoring);
      }
      this.#addComment(
        `result correction in round ${round}: ${game.white} vs ${game.black}`,
      );
      return;
    }

    // Completed round
    const completedRound = this.#completedRounds[round - 1];
    if (!completedRound) {
      throw new RangeError('invalid round number');
    }
    const index = this.#findGameIndex(
      completedRound.games,
      game.white,
      game.black,
    );
    const existing = index >= 0 ? completedRound.games[index] : undefined;
    if (index === -1 || !existing) {
      throw new RangeError(
        `no game found for ${game.white} vs ${game.black} in round ${round}`,
      );
    }
    if (isGame(existing)) {
      const whitePlayer = this.#findPlayer(existing.white);
      const blackPlayer = this.#findPlayer(existing.black);
      if (whitePlayer) {
        whitePlayer.points -= scoreForGame(existing, 'white', scoring);
      }
      if (blackPlayer) {
        blackPlayer.points -= scoreForGame(existing, 'black', scoring);
      }
    }
    const corrected: Game = {
      ...game,
      black: existing.black,
      white: existing.white,
    };
    completedRound.games[index] = corrected;
    const whitePlayer = this.#findPlayer(corrected.white);
    const blackPlayer = this.#findPlayer(corrected.black);
    if (whitePlayer) {
      whitePlayer.points += scoreForGame(corrected, 'white', scoring);
    }
    if (blackPlayer) {
      blackPlayer.points += scoreForGame(corrected, 'black', scoring);
    }
    this.#addComment(
      `result correction in round ${round}: ${game.white} vs ${game.black}`,
    );
  }

  /**
   * Late entry (FIDE C.04.2 Art 2.4). Player joins with their specified
   * points for missed rounds, paired from next `pair()` call.
   */
  enter(player: Player): void {
    const existing = this.#data.players.find((p) => p.id === player.id);
    if (existing) {
      throw new RangeError(`player ${player.id} already registered`);
    }
    this.#data.players.push(player);
    this.#addComment(`late entry: ${player.id}`);
  }

  /**
   * Restores a tournament from a serialized snapshot. The pairing system
   * function must be re-provided since functions are not JSON-serializable.
   */
  static fromJSON(
    data: TournamentData,
    options: {
      acceleration?: AccelerationMethod;
      onWarning?: (message: string) => void;
      pairingSystem: PairingSystem;
      tiebreaks?: Record<string, Tiebreak>;
    },
  ): Tournament {
    return new Tournament(data, options);
  }

  /**
   * Generates pairings for the next round using the injected pairing system.
   * If a current round exists and all games are complete, promotes it to
   * completedRounds before pairing the next round.
   *
   * @returns The pairings and byes for the new round.
   * @throws {RangeError} If the tournament is complete or the current round
   *   has unrecorded results.
   */
  pair(): Pairings {
    if (this.#currentRound) {
      const allComplete = this.#currentRound.games.every((entry) =>
        isGame(entry),
      );
      if (!allComplete) {
        throw new RangeError('current round has unrecorded results');
      }
      this.#completedRounds.push({
        byes: this.#currentRound.byes,
        games: this.#currentRound.games as Game[],
      });
      this.#currentRound = undefined;
    }

    if (this.#completedRounds.length >= this.#data.totalRounds) {
      throw new RangeError('tournament is complete');
    }

    const activePlayers = this.#data.players.filter(
      (p) => !this.#withdrawn.has(p.id),
    );
    const result = this.#pairingSystem(activePlayers, this.#completedRounds);

    this.#currentRound = {
      byes: result.byes,
      games: result.games.map((p) => ({ black: p.black, white: p.white })),
    };

    const scoring = this.#data.scoringSystem ?? FIDE_SCORING;
    for (const bye of result.byes) {
      const player = this.#findPlayer(bye.player);
      if (player) {
        player.points += scoreForBye(bye, scoring);
      }
    }

    return result;
  }

  /**
   * Records a result for a pairing in the current round. Validates the
   * pairing exists. Results accumulate on `currentRound`. The round is
   * promoted to `completedRounds` by the next `pair()` call.
   *
   * @param game - The game result to record.
   * @throws {RangeError} If no round has been paired or the players don't
   *   match any pairing.
   */
  record(game: Game): void {
    if (!this.#currentRound) {
      throw new RangeError('no round has been paired yet');
    }

    const index = this.#findGameIndex(
      this.#currentRound.games,
      game.white,
      game.black,
    );
    const existing = index >= 0 ? this.#currentRound.games[index] : undefined;
    if (index === -1 || !existing) {
      throw new RangeError(
        `no pairing found for ${game.white} vs ${game.black}`,
      );
    }

    const recorded: Game = {
      ...game,
      black: existing.black,
      white: existing.white,
    };
    this.#currentRound.games[index] = recorded;

    const scoring = this.#data.scoringSystem ?? FIDE_SCORING;
    const whitePlayer = this.#findPlayer(recorded.white);
    const blackPlayer = this.#findPlayer(recorded.black);
    if (whitePlayer) {
      whitePlayer.points += scoreForGame(recorded, 'white', scoring);
    }
    if (blackPlayer) {
      blackPlayer.points += scoreForGame(recorded, 'black', scoring);
    }
  }

  /**
   * Returns players ranked by score descending, with optional tiebreaks
   * applied in order. Scoring uses the tournament's ScoringSystem.
   *
   * @param tiebreaks - Ordered array of tiebreak functions.
   * @returns Sorted standings array.
   */
  standings(tiebreaks?: Tiebreak[]): Standing[] {
    const effectiveTiebreaks = tiebreaks ?? this.#tiebreakFns;

    const results = this.#data.players.map((player) => {
      const tiebreakValues = effectiveTiebreaks.map((tb) =>
        tb(player.id, this.#completedRounds, this.#data.players),
      );

      return {
        player: player.id,
        rank: 0,
        score: player.points,
        tiebreaks: tiebreakValues,
      };
    });

    // Sort: score desc, then tiebreaks in order desc
    results.sort((a, b) => {
      const scoreDiff = b.score - a.score;
      if (scoreDiff !== 0) {
        return scoreDiff;
      }
      for (let index = 0; index < effectiveTiebreaks.length; index++) {
        const diff = (b.tiebreaks[index] ?? 0) - (a.tiebreaks[index] ?? 0);
        if (diff !== 0) {
          return diff;
        }
      }
      return 0;
    });

    // Assign ranks (1-based, ties get same rank) and update Player.rank
    let previous: (typeof results)[number] | undefined;
    for (const [index, current] of results.entries()) {
      if (previous === undefined) {
        current.rank = 1;
      } else {
        const tied =
          current.score === previous.score &&
          current.tiebreaks.every(
            (v, index_) => v === (previous?.tiebreaks[index_] ?? 0),
          );
        current.rank = tied ? previous.rank : index + 1;
      }

      // Update Player.rank on the source data
      const player = this.#findPlayer(current.player);
      if (player) {
        player.rank = current.rank;
      }

      previous = current;
    }

    return results;
  }

  /**
   * Serializes the tournament state to a plain object suitable for
   * `JSON.stringify`.
   */
  toJSON(): TournamentData {
    return {
      ...this.#data,
      completedRounds: this.#completedRounds.map((r) => ({
        ...r,
        games: [...r.games],
      })),
      ...(this.#currentRound && {
        currentRound: {
          ...this.#currentRound,
          games: [...this.#currentRound.games],
        },
      }),
      players: [...this.#data.players],
    };
  }

  /**
   * Player leaves. No longer paired (FIDE C.04.2 Art 3.2).
   */
  withdraw(playerId: string): void {
    const player = this.#findPlayer(playerId);
    if (!player) {
      throw new RangeError(`player ${playerId} not found`);
    }
    this.#withdrawn.add(playerId);
  }
}

export { Tournament };
