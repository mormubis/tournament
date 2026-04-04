/**
 * Classifies unplayed or special game results per FIDE C.07 Article 16.2.
 *
 * | Kind           | Result | FIDE ref    |
 * | -------------- | ------ | ----------- |
 * | `forfeit-win`  | `1`    | Art. 16.2.2 |
 * | `forfeit-loss` | `0`    | Art. 16.2.4 |
 * | `full-bye`     | `1`    | —           |
 * | `half-bye`     | `0.5`  | Art. 16.2.5 |
 * | `pairing-bye`  | `1`    | Art. 16.2.1 |
 * | `zero-bye`     | `0`    | Art. 16.2.3 |
 */
type GameKind =
  | 'forfeit-loss'
  | 'forfeit-win'
  | 'full-bye'
  | 'half-bye'
  | 'pairing-bye'
  | 'zero-bye';

/** Game result from white's perspective: `1` = white wins, `0.5` = draw, `0` = black wins. */
type Result = 0 | 0.5 | 1;

/**
 * An acceleration method that adds virtual points to certain players' scores
 * in early rounds, influencing the pairing system without affecting stored
 * results or standings.
 */
interface AccelerationMethod {
  /** Returns the number of virtual points for a player in a given round. */
  virtualPoints: (player: Player, round: number, totalRounds: number) => number;
}

/** A player who receives a bye (no opponent) for a round. */
interface Bye {
  /** Player identifier. */
  player: string;
}

/** A recorded game between two players. */
interface Game {
  /** Player identifier for black. */
  black: string;
  /** Optional classification of the game type. When set, must be consistent with {@link Result}. */
  kind?: GameKind;
  /** Result from white's perspective. */
  result: Result;
  /** Player identifier for white. */
  white: string;
}

/** A pairing of two players for a round. */
interface Pairing {
  /** Player identifier for black. */
  black: string;
  /** Player identifier for white. */
  white: string;
}

/** The output of a pairing system for a single round. */
interface PairingResult {
  /** Players who receive a bye this round. */
  byes: Bye[];
  /** Pairings for this round. */
  pairings: Pairing[];
}

/** A tournament participant. */
interface Player {
  /** Unique identifier for the player. */
  id: string;
  /** Optional Elo rating. */
  rating?: number;
}

/** A player's position in the standings table. */
interface Standing {
  /** Player identifier. */
  player: string;
  /** 1-based rank. Tied players share the same rank. */
  rank: number;
  /** Cumulative score across all recorded games. */
  score: number;
  /** Tiebreak values in the order the tiebreak functions were provided. */
  tiebreaks: number[];
}

/** Options for creating a new {@link Tournament}. */
interface TournamentOptions {
  /** Optional acceleration method (e.g. {@link bakuAcceleration}). */
  acceleration?: AccelerationMethod;
  /** The pairing function to use each round. */
  pairingSystem: PairingSystem;
  /** All tournament participants. Must contain at least 2 players. */
  players: Player[];
  /** Total number of rounds. Must be at least 1. */
  rounds: number;
  /** Optional ordered list of tiebreak identifiers. Opaque strings preserved through serialization. */
  tiebreaks?: string[];
}

/** Serializable snapshot of a tournament's state, returned by {@link Tournament.toJSON}. */
interface TournamentSnapshot {
  /** The current round number (1-based), or 0 if no round has been paired. */
  currentRound: number;
  /** All recorded games, grouped by round. */
  games: Game[][];
  /** All tournament participants. */
  players: Player[];
  /** Pairings for each round, keyed by round number as a string. */
  roundPairings: Record<string, PairingResult>;
  /** Total number of rounds. */
  rounds: number;
  /** Optional ordered list of tiebreak identifiers. */
  tiebreaks?: string[];
}

/**
 * A function that generates pairings for a round given the player list and
 * game history. All pairing functions in `@echecs/swiss` and
 * `@echecs/round-robin` conform to this signature.
 */
type PairingSystem = (players: Player[], games: Game[][]) => PairingResult;

/**
 * A tiebreak function that computes a numeric value for a player based on the
 * game history. Higher values rank higher. Tiebreak functions from
 * `@echecs/buchholz`, `@echecs/sonneborn-berger`, etc. conform to this
 * signature.
 *
 * @param player - The player identifier to compute the tiebreak for.
 * @param games - All recorded games, grouped by round.
 * @param players - All tournament participants.
 * @returns A numeric tiebreak value.
 */
type Tiebreak = (player: string, games: Game[][], players: Player[]) => number;

export type {
  AccelerationMethod,
  Bye,
  Game,
  GameKind,
  Pairing,
  PairingResult,
  PairingSystem,
  Player,
  Result,
  Standing,
  Tiebreak,
  TournamentOptions,
  TournamentSnapshot,
};
