type GameKind = 'forfeit' | 'normal' | 'rated' | 'unrated';

type Result = 0 | 0.5 | 1;

interface AccelerationMethod {
  virtualPoints: (player: Player, round: number, totalRounds: number) => number;
}

interface Bye {
  player: string;
}

interface Game {
  black: string;
  kind?: GameKind;
  result: Result;
  white: string;
}

interface Pairing {
  black: string;
  white: string;
}

interface PairingResult {
  byes: Bye[];
  pairings: Pairing[];
}

interface Player {
  id: string;
  rating?: number;
}

interface Standing {
  player: string;
  rank: number;
  score: number;
  tiebreaks: number[];
}

interface TournamentOptions {
  acceleration?: AccelerationMethod;
  pairingSystem: PairingSystem;
  players: Player[];
  rounds: number;
}

interface TournamentSnapshot {
  currentRound: number;
  games: Game[][];
  players: Player[];
  roundPairings: Record<string, PairingResult>;
  rounds: number;
}

type PairingSystem = (players: Player[], games: Game[][]) => PairingResult;

type Tiebreak = (
  playerId: string,
  games: Game[][],
  players: Player[],
) => number;

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
