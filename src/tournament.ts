import type {
  AccelerationMethod,
  Game,
  GameKind,
  PairingResult,
  PairingSystem,
  Player,
  Result,
  Standing,
  Tiebreak,
  TournamentOptions,
  TournamentSnapshot,
} from './types.js';

/**
 * Stateful chess tournament orchestrator. Drives any pairing system through a
 * common lifecycle: create, pair, record results, standings, repeat.
 *
 * The pairing system is injected as a function parameter — the consumer
 * provides it from `@echecs/swiss`, `@echecs/round-robin`, or a custom
 * implementation.
 *
 * @example
 * ```typescript
 * import { Tournament } from '@echecs/tournament';
 * import { dutch } from '@echecs/swiss';
 *
 * const t = new Tournament({
 *   pairingSystem: dutch,
 *   players: [{ id: 'alice' }, { id: 'bob' }, { id: 'carol' }, { id: 'dave' }],
 *   rounds: 3,
 * });
 *
 * const r1 = t.pairRound();
 * for (const p of r1.pairings) {
 *   t.recordResult({ black: p.black, result: 1, white: p.white });
 * }
 * const standings = t.standings();
 * ```
 */
class Tournament {
  readonly #acceleration?: AccelerationMethod;
  #currentRound = 0;
  #games: Game[][] = [];
  readonly #pairingSystem: PairingSystem;
  readonly #players: Player[];
  #roundPairings = new Map<number, PairingResult>();
  readonly #rounds: number;
  readonly #tiebreaks: string[];

  /**
   * Creates a new tournament.
   *
   * @param options - Tournament configuration.
   * @throws {RangeError} If fewer than 2 players or fewer than 1 round.
   */
  constructor(options: TournamentOptions) {
    if (options.players.length < 2) {
      throw new RangeError('at least 2 players are required');
    }
    if (options.rounds < 1) {
      throw new RangeError('at least 1 round is required');
    }
    this.#acceleration = options.acceleration;
    this.#pairingSystem = options.pairingSystem;
    this.#players = [...options.players];
    this.#rounds = options.rounds;
    this.#tiebreaks = options.tiebreaks ? [...options.tiebreaks] : [];
  }

  /** The current round number (1-based), or 0 if no round has been paired yet. */
  get currentRound(): number {
    return this.#currentRound;
  }

  /** All recorded games, grouped by round. Returns a defensive copy. */
  get games(): readonly (readonly Game[])[] {
    return this.#games.map((r) => [...r]);
  }

  /** Whether all rounds have been paired and all results recorded. */
  get isComplete(): boolean {
    return (
      this.#currentRound >= this.#rounds &&
      this.#isRoundComplete(this.#currentRound)
    );
  }

  /** All tournament participants. Returns a defensive copy. */
  get players(): readonly Player[] {
    return [...this.#players];
  }

  /** Total number of rounds in the tournament. */
  get rounds(): number {
    return this.#rounds;
  }

  /** Ordered list of tiebreak identifiers. Returns a defensive copy. */
  get tiebreaks(): readonly string[] {
    return [...this.#tiebreaks];
  }

  /**
   * Removes a previously recorded result from the specified round. The game is
   * identified by the player pair (checked in both color orderings).
   *
   * After clearing, the round becomes incomplete and the pairing can be
   * re-recorded via {@link recordResult}.
   *
   * @param round - The 1-based round number.
   * @param white - One of the two player identifiers.
   * @param black - The other player identifier.
   * @throws {RangeError} If the round is invalid or no matching result exists.
   */
  clearResult(round: number, white: string, black: string): void {
    const { index, roundGames } = this.#findGame(round, white, black);
    roundGames.splice(index, 1);
  }

  /**
   * Generates pairings for the next round using the injected pairing system.
   *
   * @returns The pairings and byes for the new round.
   * @throws {RangeError} If the tournament is complete or the current round has
   *   unrecorded results.
   */
  pairRound(): PairingResult {
    if (this.#currentRound >= this.#rounds) {
      throw new RangeError('tournament is complete');
    }
    if (this.#currentRound > 0 && !this.#isRoundComplete(this.#currentRound)) {
      throw new RangeError(
        `round ${this.#currentRound} has unrecorded results`,
      );
    }

    this.#currentRound++;

    let games: Game[][] = [...this.#games];
    if (this.#acceleration) {
      const virtualGames = this.#buildVirtualGames(this.#currentRound);
      games = [virtualGames, ...games];
    }

    const result = this.#pairingSystem(this.#players, games);
    this.#roundPairings.set(this.#currentRound, result);
    this.#games.push([]);
    return result;
  }

  /**
   * Replaces an existing result in any round. The game is identified by the
   * `white`/`black` player pair (checked in both orderings). The stored game
   * retains its original color assignment.
   *
   * @param round - The 1-based round number.
   * @param game - The updated game data.
   * @throws {RangeError} If the round is invalid, no matching result exists,
   *   or `kind` and `result` are inconsistent.
   */
  updateResult(
    round: number,
    game: {
      black: string;
      kind?: GameKind;
      result: Result;
      white: string;
    },
  ): void {
    this.#validateKind(game.kind, game.result);
    const { index, roundGames } = this.#findGame(round, game.white, game.black);

    const existing = roundGames[index];
    if (existing) {
      roundGames[index] = {
        black: existing.black,
        kind: game.kind,
        result: game.result,
        white: existing.white,
      };
    }
  }

  /**
   * Records a game result for the current round.
   *
   * When `kind` is provided, the `result` must be consistent with it (e.g.
   * `forfeit-win` requires `result: 1`).
   *
   * @param game - The game result to record.
   * @throws {RangeError} If no round has been paired, the players don't match
   *   any pairing, or `kind` and `result` are inconsistent.
   */
  recordResult(game: {
    black: string;
    kind?: GameKind;
    result: Result;
    white: string;
  }): void {
    if (this.#currentRound === 0) {
      throw new RangeError('no round has been paired yet');
    }

    const roundPairings = this.#roundPairings.get(this.#currentRound);
    if (!roundPairings) {
      throw new RangeError('no pairings for current round');
    }

    const validPairing = roundPairings.pairings.some(
      (p) =>
        (p.white === game.white && p.black === game.black) ||
        (p.white === game.black && p.black === game.white),
    );
    if (!validPairing) {
      throw new RangeError(
        `no pairing found for ${game.white} vs ${game.black}`,
      );
    }

    this.#validateKind(game.kind, game.result);

    const currentRoundGames = this.#games[this.#currentRound - 1];
    if (currentRoundGames) {
      currentRoundGames.push(game);
    }
  }

  /**
   * Returns players ranked by score descending, with optional tiebreaks
   * applied in order. Tied players (same score and all tiebreak values)
   * share the same rank.
   *
   * @param tiebreaks - Ordered array of tiebreak functions. Each receives
   *   `(playerId, games, players)` and returns a number. Higher values rank
   *   higher.
   * @returns Sorted standings array.
   */
  standings(tiebreaks: Tiebreak[] = []): Standing[] {
    const results = this.#players.map((player) => {
      let score = 0;
      for (const g of this.#games.flat()) {
        if (g.white === player.id) {
          score += g.result;
        } else if (g.black === player.id) {
          score += 1 - g.result;
        }
      }

      const tiebreakValues = tiebreaks.map((tb) =>
        tb(player.id, this.#games, this.#players),
      );

      return {
        player: player.id,
        rank: 0,
        score,
        tiebreaks: tiebreakValues,
      };
    });

    // Sort: score desc, then tiebreaks in order desc
    results.sort((a, b) => {
      const scoreDiff = b.score - a.score;
      if (scoreDiff !== 0) {
        return scoreDiff;
      }
      for (let index = 0; index < tiebreaks.length; index++) {
        const diff = (b.tiebreaks[index] ?? 0) - (a.tiebreaks[index] ?? 0);
        if (diff !== 0) {
          return diff;
        }
      }
      return 0;
    });

    // Assign ranks (1-based, ties get same rank)
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
      previous = current;
    }

    return results;
  }

  /**
   * Serializes the tournament state to a plain object suitable for
   * `JSON.stringify`.
   *
   * @returns A serializable snapshot of the tournament.
   */
  toJSON(): TournamentSnapshot {
    const roundPairings: Record<string, PairingResult> = {};
    for (const [round, pairings] of this.#roundPairings) {
      roundPairings[String(round)] = pairings;
    }
    return {
      currentRound: this.#currentRound,
      games: this.#games.map((r) => [...r]),
      players: [...this.#players],
      roundPairings,
      rounds: this.#rounds,
      ...(this.#tiebreaks.length > 0 && { tiebreaks: [...this.#tiebreaks] }),
    };
  }

  /**
   * Restores a tournament from a serialized snapshot. The pairing system
   * function must be re-provided since functions are not JSON-serializable.
   *
   * @param snapshot - A snapshot previously returned by {@link toJSON}.
   * @param pairingSystem - The pairing function to use for future rounds.
   * @param acceleration - Optional acceleration method.
   * @returns A restored Tournament instance.
   */
  static fromJSON(
    snapshot: TournamentSnapshot,
    pairingSystem: PairingSystem,
    acceleration?: AccelerationMethod,
  ): Tournament {
    const tournament = new Tournament({
      acceleration,
      pairingSystem,
      players: snapshot.players,
      rounds: snapshot.rounds,
      tiebreaks: snapshot.tiebreaks,
    });
    tournament.#currentRound = snapshot.currentRound;
    tournament.#games = snapshot.games.map((r) => [...r]);
    for (const [round, pairings] of Object.entries(snapshot.roundPairings)) {
      tournament.#roundPairings.set(Number(round), pairings);
    }
    return tournament;
  }

  #findGame(
    round: number,
    white: string,
    black: string,
  ): { index: number; roundGames: Game[] } {
    if (round < 1 || round > this.#currentRound) {
      throw new RangeError('invalid round number');
    }

    const roundGames = this.#games[round - 1];
    if (!roundGames || roundGames.length === 0) {
      throw new RangeError(`no results recorded for round ${round}`);
    }

    const index = roundGames.findIndex(
      (g) =>
        (g.white === white && g.black === black) ||
        (g.white === black && g.black === white),
    );
    if (index === -1) {
      throw new RangeError(
        `no result found for ${white} vs ${black} in round ${round}`,
      );
    }

    return { index, roundGames };
  }

  #buildVirtualGames(round: number): Game[] {
    if (!this.#acceleration) {
      return [];
    }
    const virtualGames: Game[] = [];
    for (const player of this.#players) {
      const vp = this.#acceleration.virtualPoints(player, round, this.#rounds);
      if (vp > 0) {
        virtualGames.push({
          black: player.id,
          result: vp as Result,
          white: player.id,
        });
      }
    }
    return virtualGames;
  }

  #isRoundComplete(round: number): boolean {
    const pairings = this.#roundPairings.get(round);
    if (!pairings) {
      return false;
    }
    return (this.#games[round - 1]?.length ?? 0) >= pairings.pairings.length;
  }

  #validateKind(kind: GameKind | undefined, result: Result): void {
    if (kind === undefined) {
      return;
    }

    const expectedResults: Record<GameKind, Result> = {
      'forfeit-loss': 0,
      'forfeit-win': 1,
      'full-bye': 1,
      'half-bye': 0.5,
      'pairing-bye': 1,
      'zero-bye': 0,
    };

    const expected = expectedResults[kind];
    if (result !== expected) {
      throw new RangeError(
        `result ${result} is inconsistent with kind '${kind}'`,
      );
    }
  }
}

export { Tournament };
