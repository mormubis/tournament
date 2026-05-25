/**
 * An acceleration method that adds virtual points to certain players' scores
 * in early rounds, influencing the pairing system without affecting stored
 * results or standings.
 */
interface AccelerationMethod {
  /** Returns the number of virtual points for a player in a given round. */
  virtualPoints: (player: Player, round: number, totalRounds: number) => number;
}

/** Accelerated rounds configuration for a group of players. */
interface AcceleratedRound {
  firstPlayerId: string;
  firstRound: number;
  gamePoints: number;
  lastPlayerId: string;
  lastRound: number;
  matchPoints: number;
}

/** A player who receives a bye (no opponent) for a round. */
interface Bye {
  /** Bye classification. */
  kind: 'full' | 'half' | 'pairing' | 'zero';
  /** Player identifier. */
  player: string;
}

/** A completed round where all pairings have results. */
interface CompletedRound extends Pairings {
  games: Game[];
}

/**
 * A recorded game between two players.
 *
 * Strict discriminated union: invalid combinations like
 * `{ forfeit: 'both', result: 'white' }` won't typecheck.
 * `rated` only applies to played games (no forfeit).
 */
type Game = Pairing &
  (
    | { forfeit: 'black'; rated?: never; result: 'white' }
    | { forfeit: 'both'; rated?: never; result: 'none' }
    | { forfeit: 'white'; rated?: never; result: 'black' }
    | { forfeit?: never; rated?: boolean; result: 'black' | 'draw' | 'white' }
  );

/** A national rating record for a player. */
interface NationalRating {
  classification?: string;
  federation: string;
  nationalId?: string;
  rating: number;
}

/** A pairing of two players for a round. */
interface Pairing {
  /** Player identifier for black. */
  black: string;
  /** Player identifier for white. */
  white: string;
}

/** The output of a pairing system for a single round. */
interface Pairings {
  /** Players who receive a bye this round. */
  byes: Bye[];
  /** Pairings (or games) for this round. */
  games: Pairing[];
}

/** Per-player acceleration overrides. */
interface PlayerAcceleration {
  playerId: string;
  points: number[];
}

/** A tournament participant. */
interface Player {
  birthDate?: string;
  federation?: string;
  fideId?: string;
  /** Unique identifier for the player. */
  id: string;
  name?: string;
  nationalRatings?: NationalRating[];
  /** Cumulative score across all recorded games. */
  points: number;
  /** 1-based rank. */
  rank: number;
  /** Optional Elo rating. */
  rating?: number;
  sex?: 'm' | 'w';
  startingRank?: number;
  title?: 'CM' | 'FM' | 'GM' | 'IM' | 'WCM' | 'WFM' | 'WGM' | 'WIM';
}

/** Player-level score adjustment (penalty, bonus, arbiter override). */
interface PointAdjustment {
  playerId: string;
  points: number;
  reason?: string;
  /** Round this adjustment applies to. 0 = all rounds. */
  round: number;
}

/** Prevents certain players from being paired against each other. */
interface ProhibitedPairing {
  firstRound: number;
  lastRound: number;
  playerIds: string[];
}

/** A round in progress where some pairings may have results. */
interface Round extends Pairings {
  games: (Game | Pairing)[];
}

/**
 * Scoring system configuration. Color-specific values fall back to base,
 * base falls back to FIDE defaults.
 */
interface ScoringSystem {
  absence?: number;
  blackDraw?: number;
  blackLoss?: number;
  blackWin?: number;
  draw?: number;
  forfeitLoss?: number;
  forfeitWin?: number;
  fullPointBye?: number;
  halfPointBye?: number;
  loss?: number;
  pairingAllocatedBye?: number;
  unknown?: number;
  whiteDraw?: number;
  whiteLoss?: number;
  whiteWin?: number;
  win?: number;
  zeroPointBye?: number;
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

/** A team of players. */
interface Team {
  gamePoints: number;
  id: string;
  matchPoints: number;
  name: string;
  nickname?: string;
  playerIds: string[];
  rank: number;
}

/** Tournament metadata — report information passed through untouched. */
interface TournamentMetadata {
  chiefArbiter?: string;
  city?: string;
  comments?: string[];
  deputyArbiters?: string[];
  endDate?: string;
  federation?: string;
  name?: string;
  pairingController?: string;
  roundDates?: string[];
  startDate?: string;
  startingRankMethod?: string;
  timeControl?: string;
  tournamentType?: string;
}

/**
 * The plain data interface. What `toJSON()` returns and `fromJSON()` accepts.
 * What `@echecs/trf`'s `parse()` returns and `stringify()` consumes.
 */
interface TournamentData {
  acceleratedRounds?: AcceleratedRound[];
  adjustments?: PointAdjustment[];
  completedRounds: CompletedRound[];
  currentRound?: Round;
  metadata?: TournamentMetadata;
  playerAccelerations?: PlayerAcceleration[];
  players: Player[];
  prohibitedPairings?: ProhibitedPairing[];
  scoringSystem?: ScoringSystem;
  teams?: Team[];
  tiebreaks?: string[];
  totalRounds: number;
  withdrawnPlayers?: string[];
}

/**
 * A function that generates pairings for a round given the player list and
 * completed rounds.
 */
type PairingSystem = (players: Player[], rounds: CompletedRound[]) => Pairings;

/**
 * A tiebreak function that computes a numeric value for a player based on the
 * completed rounds. Higher values rank higher.
 *
 * @param player - The player identifier to compute the tiebreak for.
 * @param rounds - All completed rounds.
 * @param players - All tournament participants.
 * @returns A numeric tiebreak value.
 */
type Tiebreak = (
  player: string,
  rounds: CompletedRound[],
  players: Player[],
) => number;

export type {
  AccelerationMethod,
  AcceleratedRound,
  Bye,
  CompletedRound,
  Game,
  NationalRating,
  Pairing,
  PairingSystem,
  Pairings,
  Player,
  PlayerAcceleration,
  PointAdjustment,
  ProhibitedPairing,
  Round,
  ScoringSystem,
  Standing,
  Team,
  Tiebreak,
  TournamentData,
  TournamentMetadata,
};
