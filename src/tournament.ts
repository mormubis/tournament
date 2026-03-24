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

class Tournament {
  readonly #acceleration?: AccelerationMethod;
  #currentRound = 0;
  #games: Game[][] = [];
  readonly #pairingSystem: PairingSystem;
  readonly #players: Player[];
  #roundPairings = new Map<number, PairingResult>();
  readonly #rounds: number;

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
  }

  get currentRound(): number {
    return this.#currentRound;
  }

  get games(): readonly (readonly Game[])[] {
    return this.#games.map((r) => [...r]);
  }

  get isComplete(): boolean {
    return (
      this.#currentRound >= this.#rounds &&
      this.#isRoundComplete(this.#currentRound)
    );
  }

  get players(): readonly Player[] {
    return [...this.#players];
  }

  get rounds(): number {
    return this.#rounds;
  }

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

    const currentRoundGames = this.#games[this.#currentRound - 1];
    if (currentRoundGames) {
      currentRoundGames.push(game);
    }
  }

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
    };
  }

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
    });
    tournament.#currentRound = snapshot.currentRound;
    tournament.#games = snapshot.games.map((r) => [...r]);
    for (const [round, pairings] of Object.entries(snapshot.roundPairings)) {
      tournament.#roundPairings.set(Number(round), pairings);
    }
    return tournament;
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
          black: '',
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
}

export { Tournament };
