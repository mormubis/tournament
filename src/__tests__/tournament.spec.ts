import { describe, expect, it } from 'vitest';

import { FIDE_SCORING } from '../scoring.js';
import { Tournament } from '../tournament.js';

import type {
  Bye,
  Game,
  Pairing,
  PairingSystem,
  Pairings,
  Player,
  Tiebreak,
  TournamentData,
} from '../types.js';

const tiebreakConstant: Tiebreak = () => 42;
const tiebreakFavorA: Tiebreak = (playerId) => (playerId === 'a' ? 1 : 0);
const tiebreakZero: Tiebreak = () => 0;

const mockPairingSystem: PairingSystem = (players): Pairings => {
  const games: Pairing[] = [];
  for (let index = 0; index < players.length - 1; index += 2) {
    games.push({
      black: players[index + 1]!.id,
      white: players[index]!.id,
    });
  }
  const byes: Bye[] =
    players.length % 2 === 0
      ? []
      : [{ kind: 'pairing', player: players.at(-1)!.id }];
  return { byes, games };
};

const players: Player[] = [
  { id: 'a', points: 0, rank: 1 },
  { id: 'b', points: 0, rank: 2 },
  { id: 'c', points: 0, rank: 3 },
  { id: 'd', points: 0, rank: 4 },
];

function makeData(overrides?: Partial<TournamentData>): TournamentData {
  return {
    completedRounds: [],
    players: players.map((p) => ({ ...p })),
    totalRounds: 3,
    ...overrides,
  };
}

function makeGame(
  white: string,
  black: string,
  result: 'black' | 'draw' | 'white',
): Game {
  return { black, result, white };
}

const byePairingSystem: PairingSystem = (ps): Pairings => {
  const games: Pairing[] = [];
  const byes: Bye[] = [];
  for (let index = 0; index < ps.length - 1; index += 2) {
    games.push({ black: ps[index + 1]!.id, white: ps[index]!.id });
  }
  if (ps.length % 2 !== 0) {
    byes.push({ kind: 'half', player: ps.at(-1)!.id });
  }
  return { byes, games };
};

const fullByePairingSystem: PairingSystem = (ps): Pairings => {
  const games: Pairing[] = [];
  const byes: Bye[] = [];
  for (let index = 0; index < ps.length - 1; index += 2) {
    games.push({ black: ps[index + 1]!.id, white: ps[index]!.id });
  }
  if (ps.length % 2 !== 0) {
    byes.push({ kind: 'full', player: ps.at(-1)!.id });
  }
  return { byes, games };
};

/** Helper: pair a round, record all results as white wins, return the tournament. */
function pairAndRecordRound(t: Tournament): Pairings {
  const pairings = t.pair();
  for (const p of pairings.games) {
    t.record(makeGame(p.white, p.black, 'white'));
  }
  return pairings;
}

describe('Tournament', () => {
  describe('constructor', () => {
    it('creates a tournament with valid data', () => {
      const t = new Tournament(makeData(), {
        pairingSystem: mockPairingSystem,
      });
      expect(t).toBeInstanceOf(Tournament);
    });

    it('resolves tiebreaks from registry', () => {
      const t = new Tournament(makeData({ tiebreaks: ['BH'] }), {
        pairingSystem: mockPairingSystem,
        tiebreaks: { BH: tiebreakConstant },
      });
      const s = t.standings();
      expect(s[0]!.tiebreaks).toEqual([42]);
    });

    it('calls onWarning for unresolved tiebreaks', () => {
      const warnings: string[] = [];
      new Tournament(makeData({ tiebreaks: ['BH', 'SB'] }), {
        onWarning: (message) => warnings.push(message),
        pairingSystem: mockPairingSystem,
        tiebreaks: { BH: tiebreakZero },
      });
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('SB');
    });

    it('standings uses constructor tiebreaks by default', () => {
      const t = new Tournament(
        makeData({
          players: [
            { id: 'a', points: 0, rank: 1 },
            { id: 'b', points: 0, rank: 2 },
          ],
          tiebreaks: ['FAV'],
          totalRounds: 1,
        }),
        {
          pairingSystem: mockPairingSystem,
          tiebreaks: { FAV: tiebreakFavorA },
        },
      );
      t.pair();
      t.record(makeGame('a', 'b', 'draw'));
      const s = t.standings();
      expect(s[0]!.player).toBe('a');
      expect(s[0]!.tiebreaks).toEqual([1]);
    });
  });

  describe('pair()', () => {
    it('returns pairings for round 1', () => {
      const t = new Tournament(makeData(), {
        pairingSystem: mockPairingSystem,
      });
      const result = t.pair();
      expect(result.games).toHaveLength(2);
      expect(result.byes).toHaveLength(0);
    });

    it('throws RangeError when tournament is complete', () => {
      const t = new Tournament(makeData({ totalRounds: 1 }), {
        pairingSystem: mockPairingSystem,
      });
      pairAndRecordRound(t);
      expect(() => t.pair()).toThrow(RangeError);
    });

    it('throws RangeError when current round has unrecorded results', () => {
      const t = new Tournament(makeData(), {
        pairingSystem: mockPairingSystem,
      });
      t.pair();
      // Don't record results — pair again should throw
      expect(() => t.pair()).toThrow(RangeError);
    });

    it('promotes completed currentRound to completedRounds', () => {
      const t = new Tournament(makeData({ totalRounds: 2 }), {
        pairingSystem: mockPairingSystem,
      });
      t.pair();
      t.record(makeGame('a', 'b', 'white'));
      t.record(makeGame('c', 'd', 'white'));
      t.pair(); // should promote round 1, then pair round 2
      expect(t.completedRounds).toHaveLength(1);
      expect(t.currentRound).toBeDefined();
    });

    it('updates Player.points for byes on pair', () => {
      const t = new Tournament(
        makeData({
          players: [
            { id: 'a', points: 0, rank: 1 },
            { id: 'b', points: 0, rank: 2 },
            { id: 'c', points: 0, rank: 3 },
          ],
          totalRounds: 1,
        }),
        { pairingSystem: byePairingSystem },
      );
      t.pair();
      const c = t.players.find((p) => p.id === 'c')!;
      expect(c.points).toBe(0.5); // half-bye from byePairingSystem
    });

    it('calls onWarning for full-point byes (FIDE deprecated)', () => {
      const warnings: string[] = [];
      const t = new Tournament(
        makeData({
          players: [
            { id: 'a', points: 0, rank: 1 },
            { id: 'b', points: 0, rank: 2 },
            { id: 'c', points: 0, rank: 3 },
          ],
          totalRounds: 1,
        }),
        {
          onWarning: (message) => warnings.push(message),
          pairingSystem: fullByePairingSystem,
        },
      );
      t.pair();
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('full-point bye');
      expect(warnings[0]).toContain('deprecated');
    });
  });

  describe('record()', () => {
    it('updates Player.points on record', () => {
      const t = new Tournament(
        makeData({
          players: [
            { id: 'a', points: 0, rank: 1 },
            { id: 'b', points: 0, rank: 2 },
          ],
          totalRounds: 1,
        }),
        { pairingSystem: mockPairingSystem },
      );
      t.pair();
      t.record(makeGame('a', 'b', 'white'));
      const a = t.players.find((p) => p.id === 'a')!;
      const b = t.players.find((p) => p.id === 'b')!;
      expect(a.points).toBe(1);
      expect(b.points).toBe(0);
    });

    it('updates Player.points for draw', () => {
      const t = new Tournament(
        makeData({
          players: [
            { id: 'a', points: 0, rank: 1 },
            { id: 'b', points: 0, rank: 2 },
          ],
          totalRounds: 1,
        }),
        { pairingSystem: mockPairingSystem },
      );
      t.pair();
      t.record(makeGame('a', 'b', 'draw'));
      expect(t.players.find((p) => p.id === 'a')!.points).toBe(0.5);
      expect(t.players.find((p) => p.id === 'b')!.points).toBe(0.5);
    });

    it('updates Player.points for forfeit', () => {
      const t = new Tournament(
        makeData({
          players: [
            { id: 'a', points: 0, rank: 1 },
            { id: 'b', points: 0, rank: 2 },
          ],
          totalRounds: 1,
        }),
        { pairingSystem: mockPairingSystem },
      );
      t.pair();
      t.record({ black: 'b', forfeit: 'black', result: 'white', white: 'a' });
      expect(t.players.find((p) => p.id === 'a')!.points).toBe(1);
      expect(t.players.find((p) => p.id === 'b')!.points).toBe(0);
    });

    it('records a game result', () => {
      const t = new Tournament(makeData(), {
        pairingSystem: mockPairingSystem,
      });
      t.pair();
      t.record(makeGame('a', 'b', 'white'));
      // Round should not be auto-completed yet (only 1 of 2 games recorded)
      expect(t.currentRound).toBeDefined();
      expect(t.currentRound!.games).toHaveLength(2);
    });

    it('does not auto-promote round to completedRounds', () => {
      const t = new Tournament(makeData({ totalRounds: 2 }), {
        pairingSystem: mockPairingSystem,
      });
      t.pair();
      t.record(makeGame('a', 'b', 'white'));
      t.record(makeGame('c', 'd', 'white'));
      // Round should stay as currentRound even though all games recorded
      expect(t.currentRound).toBeDefined();
      expect(t.completedRounds).toHaveLength(0);
    });

    it('throws RangeError for a non-existent pairing', () => {
      const t = new Tournament(makeData(), {
        pairingSystem: mockPairingSystem,
      });
      t.pair();
      expect(() => t.record(makeGame('x', 'z', 'white'))).toThrow(RangeError);
    });

    it('throws RangeError when no round has been paired yet', () => {
      const t = new Tournament(makeData(), {
        pairingSystem: mockPairingSystem,
      });
      expect(() => t.record(makeGame('a', 'b', 'white'))).toThrow(RangeError);
    });

    it('games accumulate across rounds', () => {
      const t = new Tournament(makeData(), {
        pairingSystem: mockPairingSystem,
      });
      pairAndRecordRound(t);
      pairAndRecordRound(t);
      // After 2 pairAndRecordRounds: round 1 was promoted when round 2 was paired,
      // round 2 stays as currentRound (no subsequent pair() call)
      const completedGames = t.completedRounds.reduce(
        (sum, r) => sum + r.games.length,
        0,
      );
      const currentGames = t.currentRound?.games.length ?? 0;
      expect(completedGames + currentGames).toBe(4);
    });
  });

  describe('standings()', () => {
    it('returns all players with score 0 before any games', () => {
      const t = new Tournament(makeData({ totalRounds: 1 }), {
        pairingSystem: mockPairingSystem,
      });
      const s = t.standings();
      expect(s).toHaveLength(4);
      expect(s.every((x) => x.score === 0)).toBe(true);
    });

    it('computes scores from recorded games', () => {
      const t = new Tournament(makeData({ totalRounds: 1 }), {
        pairingSystem: mockPairingSystem,
      });
      pairAndRecordRound(t);
      const s = t.standings();
      const a = s.find((x) => x.player === 'a')!;
      const b = s.find((x) => x.player === 'b')!;
      expect(a.score).toBe(1);
      expect(b.score).toBe(0);
    });

    it('ranks players by score descending', () => {
      const t = new Tournament(makeData({ totalRounds: 1 }), {
        pairingSystem: mockPairingSystem,
      });
      pairAndRecordRound(t);
      const s = t.standings();
      expect(s[0]!.rank).toBe(1);
      expect(s[0]!.score).toBeGreaterThanOrEqual(s[1]!.score);
    });

    it('applies tiebreak functions in order', () => {
      const t = new Tournament(
        makeData({
          players: [
            { id: 'a', points: 0, rank: 1 },
            { id: 'b', points: 0, rank: 2 },
          ],
          totalRounds: 1,
        }),
        { pairingSystem: mockPairingSystem },
      );
      t.pair();
      t.record(makeGame('a', 'b', 'draw'));
      // Both have score 0.5; tiebreak returns higher value for 'a'
      const s = t.standings([tiebreakFavorA]);
      expect(s[0]!.player).toBe('a');
      expect(s[0]!.rank).toBe(1);
      expect(s[1]!.rank).toBe(2);
    });

    it('assigns same rank to tied players', () => {
      const t = new Tournament(
        makeData({
          players: [
            { id: 'a', points: 0, rank: 1 },
            { id: 'b', points: 0, rank: 2 },
          ],
          totalRounds: 1,
        }),
        { pairingSystem: mockPairingSystem },
      );
      t.pair();
      t.record(makeGame('a', 'b', 'draw'));
      const s = t.standings(); // no tiebreaks - tied
      expect(s[0]!.rank).toBe(1);
      expect(s[1]!.rank).toBe(1);
    });

    it('works with no tiebreaks argument', () => {
      const t = new Tournament(makeData({ totalRounds: 1 }), {
        pairingSystem: mockPairingSystem,
      });
      expect(() => t.standings()).not.toThrow();
      expect(t.standings()).toHaveLength(4);
    });

    it('populates tiebreak values in standing entries', () => {
      const t = new Tournament(
        makeData({
          players: [
            { id: 'a', points: 0, rank: 1 },
            { id: 'b', points: 0, rank: 2 },
          ],
          totalRounds: 1,
        }),
        { pairingSystem: mockPairingSystem },
      );
      t.pair();
      t.record(makeGame('a', 'b', 'white'));
      const s = t.standings([tiebreakConstant]);
      expect(s[0]!.tiebreaks).toEqual([42]);
    });

    it('includes bye points in standings', () => {
      const t = new Tournament(
        makeData({
          players: [
            { id: 'a', points: 0, rank: 1 },
            { id: 'b', points: 0, rank: 2 },
            { id: 'c', points: 0, rank: 3 },
          ],
          totalRounds: 1,
        }),
        { pairingSystem: byePairingSystem },
      );
      const pairings = t.pair();
      for (const p of pairings.games) {
        t.record(makeGame(p.white, p.black, 'draw'));
      }
      const s = t.standings();
      const c = s.find((x) => x.player === 'c')!;
      expect(c.score).toBe(0.5); // half-bye
    });

    it('includes point adjustments in standings', () => {
      const t = new Tournament(makeData({ totalRounds: 1 }), {
        pairingSystem: mockPairingSystem,
      });
      pairAndRecordRound(t);
      t.adjust({ playerId: 'a', points: -0.5, round: 0 });
      const s = t.standings();
      const a = s.find((x) => x.player === 'a')!;
      expect(a.score).toBe(0.5); // 1 (win) - 0.5 (adjustment)
    });

    it('standings reads Player.points directly', () => {
      const t = new Tournament(
        makeData({
          players: [
            { id: 'a', points: 3, rank: 1 },
            { id: 'b', points: 1, rank: 2 },
          ],
          totalRounds: 5,
        }),
        { pairingSystem: mockPairingSystem },
      );
      // No games recorded — standings should reflect initial points
      const s = t.standings();
      expect(s[0]!.player).toBe('a');
      expect(s[0]!.score).toBe(3);
      expect(s[1]!.player).toBe('b');
      expect(s[1]!.score).toBe(1);
    });
  });

  describe('correct()', () => {
    it('corrects a result in a completed round', () => {
      const t = new Tournament(makeData({ totalRounds: 2 }), {
        pairingSystem: mockPairingSystem,
      });
      pairAndRecordRound(t);
      pairAndRecordRound(t);
      // Correct round 1 result
      t.correct(1, makeGame('a', 'b', 'black'));
      const game = t.completedRounds[0]!.games.find(
        (g) => g.white === 'a' && g.black === 'b',
      );
      expect(game!.result).toBe('black');
    });

    it('logs a comment on correction', () => {
      const t = new Tournament(makeData({ totalRounds: 1 }), {
        pairingSystem: mockPairingSystem,
      });
      pairAndRecordRound(t);
      t.correct(1, makeGame('a', 'b', 'draw'));
      expect(t.metadata?.comments).toBeDefined();
      expect(t.metadata!.comments!.length).toBeGreaterThan(0);
    });

    it('throws RangeError for invalid round', () => {
      const t = new Tournament(makeData({ totalRounds: 1 }), {
        pairingSystem: mockPairingSystem,
      });
      pairAndRecordRound(t);
      expect(() => t.correct(0, makeGame('a', 'b', 'draw'))).toThrow(
        RangeError,
      );
    });

    it('throws RangeError for non-existent pairing', () => {
      const t = new Tournament(makeData({ totalRounds: 1 }), {
        pairingSystem: mockPairingSystem,
      });
      pairAndRecordRound(t);
      expect(() => t.correct(1, makeGame('x', 'y', 'draw'))).toThrow(
        RangeError,
      );
    });

    it('correct() adjusts Player.points', () => {
      const t = new Tournament(
        makeData({
          players: [
            { id: 'a', points: 0, rank: 1 },
            { id: 'b', points: 0, rank: 2 },
          ],
          totalRounds: 1,
        }),
        { pairingSystem: mockPairingSystem },
      );
      t.pair();
      t.record(makeGame('a', 'b', 'white')); // a=1, b=0
      t.correct(1, makeGame('a', 'b', 'black')); // a=0, b=1
      expect(t.players.find((p) => p.id === 'a')!.points).toBe(0);
      expect(t.players.find((p) => p.id === 'b')!.points).toBe(1);
    });

    it('standings reflect the corrected result', () => {
      const t = new Tournament(
        makeData({
          players: [
            { id: 'a', points: 0, rank: 1 },
            { id: 'b', points: 0, rank: 2 },
          ],
          totalRounds: 1,
        }),
        { pairingSystem: mockPairingSystem },
      );
      t.pair();
      t.record(makeGame('a', 'b', 'white')); // a wins
      expect(t.standings().find((s) => s.player === 'a')!.score).toBe(1);

      t.correct(1, makeGame('a', 'b', 'black')); // change to b wins
      expect(t.standings().find((s) => s.player === 'a')!.score).toBe(0);
      expect(t.standings().find((s) => s.player === 'b')!.score).toBe(1);
    });
  });

  describe('clear()', () => {
    it('clears a result in the current round', () => {
      const t = new Tournament(makeData({ totalRounds: 1 }), {
        pairingSystem: mockPairingSystem,
      });
      pairAndRecordRound(t);
      // Round 1 stays as currentRound after recording all results
      t.clear(1, 'a', 'b');
      const game = t.currentRound!.games.find(
        (g) => g.white === 'a' && g.black === 'b',
      );
      // Should be reverted to a pairing (no result)
      expect(game).toBeDefined();
      expect('result' in game! && typeof game!.result === 'string').toBe(false);
    });

    it('clear() subtracts points from Player.points', () => {
      const t = new Tournament(
        makeData({
          players: [
            { id: 'a', points: 0, rank: 1 },
            { id: 'b', points: 0, rank: 2 },
          ],
          totalRounds: 1,
        }),
        { pairingSystem: mockPairingSystem },
      );
      t.pair();
      t.record(makeGame('a', 'b', 'white')); // a=1, b=0
      t.clear(1, 'a', 'b'); // a=0, b=0
      expect(t.players.find((p) => p.id === 'a')!.points).toBe(0);
      expect(t.players.find((p) => p.id === 'b')!.points).toBe(0);
    });

    it('clears a result in a promoted completed round', () => {
      const t = new Tournament(makeData({ totalRounds: 2 }), {
        pairingSystem: mockPairingSystem,
      });
      pairAndRecordRound(t);
      t.pair(); // promotes round 1 to completedRounds
      // Clear a game in the now-completed round 1
      t.clear(1, 'a', 'b');
      const game = t.completedRounds[0]!.games.find(
        (g) => g.white === 'a' && g.black === 'b',
      );
      expect(game).toBeDefined();
      expect('result' in game! && typeof game!.result === 'string').toBe(false);
      // Player points should be decremented
      expect(t.players.find((p) => p.id === 'a')!.points).toBe(0);
    });

    it('throws RangeError for round 0', () => {
      const t = new Tournament(makeData({ totalRounds: 1 }), {
        pairingSystem: mockPairingSystem,
      });
      pairAndRecordRound(t);
      expect(() => t.clear(0, 'a', 'b')).toThrow(RangeError);
    });

    it('throws RangeError for invalid round', () => {
      const t = new Tournament(makeData({ totalRounds: 1 }), {
        pairingSystem: mockPairingSystem,
      });
      pairAndRecordRound(t);
      expect(() => t.clear(5, 'a', 'b')).toThrow(RangeError);
    });
  });

  describe('enter()', () => {
    it('adds a new player', () => {
      const t = new Tournament(makeData(), {
        pairingSystem: mockPairingSystem,
      });
      t.enter({ id: 'e', points: 0, rank: 5 });
      expect(t.players).toHaveLength(5);
      expect(t.players.find((p) => p.id === 'e')).toBeDefined();
    });

    it('logs a comment on late entry', () => {
      const t = new Tournament(makeData(), {
        pairingSystem: mockPairingSystem,
      });
      t.enter({ id: 'e', points: 0, rank: 5 });
      expect(t.metadata?.comments).toBeDefined();
      expect(t.metadata!.comments!.some((c) => c.includes('late entry'))).toBe(
        true,
      );
    });

    it('throws RangeError for duplicate player', () => {
      const t = new Tournament(makeData(), {
        pairingSystem: mockPairingSystem,
      });
      expect(() => t.enter({ id: 'a', points: 0, rank: 5 })).toThrow(
        RangeError,
      );
    });
  });

  describe('withdraw()', () => {
    it('withdrawn player stays in players but is not paired', () => {
      const t = new Tournament(
        makeData({
          players: [
            { id: 'a', points: 0, rank: 1 },
            { id: 'b', points: 0, rank: 2 },
            { id: 'c', points: 0, rank: 3 },
            { id: 'd', points: 0, rank: 4 },
          ],
          totalRounds: 3,
        }),
        { pairingSystem: mockPairingSystem },
      );
      pairAndRecordRound(t);
      t.withdraw('d');
      // Player stays in roster
      expect(t.players).toHaveLength(4);
      expect(t.players.find((p) => p.id === 'd')).toBeDefined();
      // But is excluded from next pairing
      const r2 = t.pair();
      const pairedIds = [
        ...r2.games.flatMap((g) => [g.white, g.black]),
        ...r2.byes.map((b) => b.player),
      ];
      expect(pairedIds).not.toContain('d');
    });

    it('withdrawn player still appears in standings', () => {
      const t = new Tournament(
        makeData({
          players: [
            { id: 'a', points: 0, rank: 1 },
            { id: 'b', points: 0, rank: 2 },
            { id: 'c', points: 0, rank: 3 },
            { id: 'd', points: 0, rank: 4 },
          ],
          totalRounds: 3,
        }),
        { pairingSystem: mockPairingSystem },
      );
      pairAndRecordRound(t);
      t.withdraw('d');
      const s = t.standings();
      expect(s.find((x) => x.player === 'd')).toBeDefined();
    });

    it('throws RangeError for non-existent player', () => {
      const t = new Tournament(makeData(), {
        pairingSystem: mockPairingSystem,
      });
      expect(() => t.withdraw('z')).toThrow(RangeError);
    });

    it('persists withdrawnPlayers in toJSON()', () => {
      const t = new Tournament(
        makeData({
          players: [
            { id: 'a', points: 0, rank: 1 },
            { id: 'b', points: 0, rank: 2 },
            { id: 'c', points: 0, rank: 3 },
            { id: 'd', points: 0, rank: 4 },
          ],
          totalRounds: 3,
        }),
        { pairingSystem: mockPairingSystem },
      );
      t.withdraw('d');
      const json = t.toJSON();
      expect(json.withdrawnPlayers).toEqual(['d']);
    });

    it('restores withdrawnPlayers from data', () => {
      const t = new Tournament(
        makeData({
          players: [
            { id: 'a', points: 0, rank: 1 },
            { id: 'b', points: 0, rank: 2 },
            { id: 'c', points: 0, rank: 3 },
            { id: 'd', points: 0, rank: 4 },
          ],
          totalRounds: 3,
          withdrawnPlayers: ['d'],
        }),
        { pairingSystem: mockPairingSystem },
      );
      // 'd' should be excluded from pairing
      const r1 = t.pair();
      const pairedIds = [
        ...r1.games.flatMap((g) => [g.white, g.black]),
        ...r1.byes.map((b) => b.player),
      ];
      expect(pairedIds).not.toContain('d');
    });
  });

  describe('adjust()', () => {
    it('adds a point adjustment', () => {
      const t = new Tournament(makeData(), {
        pairingSystem: mockPairingSystem,
      });
      t.adjust({ playerId: 'a', points: -1, round: 0 });
      const json = t.toJSON();
      expect(json.adjustments).toHaveLength(1);
      expect(json.adjustments![0]!.points).toBe(-1);
    });

    it('adjust() updates Player.points', () => {
      const t = new Tournament(makeData(), {
        pairingSystem: mockPairingSystem,
      });
      t.adjust({ playerId: 'a', points: -0.5, round: 0 });
      expect(t.players.find((p) => p.id === 'a')!.points).toBe(-0.5);
    });

    it('logs a comment on adjustment', () => {
      const t = new Tournament(makeData(), {
        pairingSystem: mockPairingSystem,
      });
      t.adjust({ playerId: 'a', points: -1, reason: 'late', round: 1 });
      expect(t.metadata?.comments).toBeDefined();
      expect(
        t.metadata!.comments!.some((c) => c.includes('point adjustment')),
      ).toBe(true);
    });
  });

  describe('serialization', () => {
    it('toJSON returns a plain serializable object', () => {
      const t = new Tournament(makeData({ totalRounds: 2 }), {
        pairingSystem: mockPairingSystem,
      });
      pairAndRecordRound(t);
      // Round 1 stays as currentRound until next pair() promotes it
      const json = t.toJSON();
      expect(json.currentRound).toBeDefined();
      expect(json.currentRound!.games).toHaveLength(2);
      expect(json.totalRounds).toBe(2);
      // eslint-disable-next-line unicorn/prefer-structured-clone
      expect(JSON.parse(JSON.stringify(json))).toEqual(json);
    });

    it('constructor restores tournament state', () => {
      const t = new Tournament(makeData({ totalRounds: 2 }), {
        pairingSystem: mockPairingSystem,
      });
      pairAndRecordRound(t);
      const json = t.toJSON();
      const restored = new Tournament(json, {
        pairingSystem: mockPairingSystem,
      });
      expect(restored.toJSON()).toEqual(json);
    });

    it('restored tournament can continue pairing', () => {
      const t = new Tournament(makeData({ totalRounds: 2 }), {
        pairingSystem: mockPairingSystem,
      });
      pairAndRecordRound(t);
      const restored = new Tournament(t.toJSON(), {
        pairingSystem: mockPairingSystem,
      });
      expect(() => restored.pair()).not.toThrow();
    });

    it('round-trips preserve all state', () => {
      const t = new Tournament(makeData({ totalRounds: 2 }), {
        pairingSystem: mockPairingSystem,
      });
      pairAndRecordRound(t);
      const snap1 = t.toJSON();
      const restored = new Tournament(snap1, {
        pairingSystem: mockPairingSystem,
      });
      const snap2 = restored.toJSON();
      expect(snap2).toEqual(snap1);
    });

    it('toJSON includes tiebreaks when configured', () => {
      const t = new Tournament(
        makeData({
          tiebreaks: ['buchholz', 'sonneborn-berger'],
          totalRounds: 2,
        }),
        { pairingSystem: mockPairingSystem },
      );
      const json = t.toJSON();
      expect(json.tiebreaks).toEqual(['buchholz', 'sonneborn-berger']);
    });

    it('serialization round-trip preserves corrected results', () => {
      const t = new Tournament(makeData({ totalRounds: 2 }), {
        pairingSystem: mockPairingSystem,
      });
      pairAndRecordRound(t);
      // Round 1 is still currentRound; correct() operates on it
      t.correct(1, makeGame('a', 'b', 'black'));

      const snap = t.toJSON();
      const restored = new Tournament(snap, {
        pairingSystem: mockPairingSystem,
      });
      // The corrected game is in currentRound (round 1 not yet promoted)
      const restoredGame = restored.currentRound!.games.find(
        (g) => g.white === 'a' && g.black === 'b',
      );
      expect('result' in restoredGame! && restoredGame.result).toBe('black');
    });
  });

  describe('Game type', () => {
    it('accepts a played game with rated flag', () => {
      const t = new Tournament(makeData({ totalRounds: 1 }), {
        pairingSystem: mockPairingSystem,
      });
      t.pair();
      expect(() =>
        t.record({ black: 'b', rated: true, result: 'white', white: 'a' }),
      ).not.toThrow();
    });

    it('accepts forfeit game', () => {
      const t = new Tournament(makeData({ totalRounds: 1 }), {
        pairingSystem: mockPairingSystem,
      });
      t.pair();
      expect(() =>
        t.record({
          black: 'b',
          forfeit: 'black',
          result: 'white',
          white: 'a',
        }),
      ).not.toThrow();
    });

    it('accepts double forfeit', () => {
      const t = new Tournament(makeData({ totalRounds: 1 }), {
        pairingSystem: mockPairingSystem,
      });
      t.pair();
      expect(() =>
        t.record({
          black: 'b',
          forfeit: 'both',
          result: 'none',
          white: 'a',
        }),
      ).not.toThrow();
    });
  });

  describe('ScoringSystem', () => {
    it('uses custom scoring system', () => {
      const t = new Tournament(
        makeData({
          players: [
            { id: 'a', points: 0, rank: 1 },
            { id: 'b', points: 0, rank: 2 },
          ],
          scoringSystem: { draw: 0.3, loss: 0, win: 3 },
          totalRounds: 1,
        }),
        { pairingSystem: mockPairingSystem },
      );
      t.pair();
      t.record(makeGame('a', 'b', 'white'));
      const s = t.standings();
      expect(s.find((x) => x.player === 'a')!.score).toBe(3);
      expect(s.find((x) => x.player === 'b')!.score).toBe(0);
    });

    it('uses FIDE defaults when no scoring system specified', () => {
      const t = new Tournament(
        makeData({
          players: [
            { id: 'a', points: 0, rank: 1 },
            { id: 'b', points: 0, rank: 2 },
          ],
          totalRounds: 1,
        }),
        { pairingSystem: mockPairingSystem },
      );
      t.pair();
      t.record(makeGame('a', 'b', 'draw'));
      const s = t.standings();
      expect(s.find((x) => x.player === 'a')!.score).toBe(0.5);
      expect(s.find((x) => x.player === 'b')!.score).toBe(0.5);
    });
  });

  describe('FIDE_SCORING', () => {
    it('exports FIDE default values', () => {
      expect(FIDE_SCORING.win).toBe(1);
      expect(FIDE_SCORING.draw).toBe(0.5);
      expect(FIDE_SCORING.loss).toBe(0);
      expect(FIDE_SCORING.forfeitWin).toBe(1);
      expect(FIDE_SCORING.forfeitLoss).toBe(0);
      expect(FIDE_SCORING.fullPointBye).toBe(1);
      expect(FIDE_SCORING.halfPointBye).toBe(0.5);
      expect(FIDE_SCORING.pairingAllocatedBye).toBe(1);
      expect(FIDE_SCORING.zeroPointBye).toBe(0);
      expect(FIDE_SCORING.absence).toBe(0);
    });
  });

  describe('full lifecycle', () => {
    it('completes a 1-round tournament', () => {
      const t = new Tournament(makeData({ totalRounds: 1 }), {
        pairingSystem: mockPairingSystem,
      });
      pairAndRecordRound(t);
      // The last round stays as currentRound until pair() is called
      expect(t.currentRound).toBeDefined();
      expect(t.completedRounds).toHaveLength(0);
      // pair() promotes the round, then throws because tournament is complete
      expect(() => t.pair()).toThrow(RangeError);
      // After the throw, state is consistent: round promoted, no currentRound
      expect(t.completedRounds).toHaveLength(1);
      expect(t.currentRound).toBeUndefined();
    });

    it('completes a 2-round tournament pair-record-pair-record', () => {
      const t = new Tournament(makeData({ totalRounds: 2 }), {
        pairingSystem: mockPairingSystem,
      });
      pairAndRecordRound(t);
      pairAndRecordRound(t);
      // Round 1 promoted when round 2 was paired; round 2 stays as currentRound
      expect(t.completedRounds).toHaveLength(1);
      expect(t.currentRound).toBeDefined();
      // pair() promotes round 2 and then throws tournament is complete
      expect(() => t.pair()).toThrow(RangeError);

      const s = t.standings();
      expect(s).toHaveLength(4);
      // 2 rounds x 2 games x 1 point per game = 4 total points
      const totalScore = s.reduce((sum, entry) => sum + entry.score, 0);
      expect(totalScore).toBe(4);
    });

    it('supports late entry mid-tournament', () => {
      const t = new Tournament(makeData({ totalRounds: 3 }), {
        pairingSystem: mockPairingSystem,
      });
      pairAndRecordRound(t);
      t.enter({ id: 'e', points: 0, rank: 5 });
      // Should be able to pair with 5 players now
      const r2 = t.pair();
      expect(r2.games.length + r2.byes.length).toBeGreaterThanOrEqual(3);
    });

    it('supports withdrawal mid-tournament', () => {
      const t = new Tournament(
        makeData({
          players: [
            { id: 'a', points: 0, rank: 1 },
            { id: 'b', points: 0, rank: 2 },
            { id: 'c', points: 0, rank: 3 },
            { id: 'd', points: 0, rank: 4 },
            { id: 'e', points: 0, rank: 5 },
            { id: 'f', points: 0, rank: 6 },
          ],
          totalRounds: 3,
        }),
        { pairingSystem: mockPairingSystem },
      );
      pairAndRecordRound(t);
      t.withdraw('f');
      // Player stays in roster (tracking, not removing)
      expect(t.players).toHaveLength(6);
      expect(t.players.find((p) => p.id === 'f')).toBeDefined();
    });
  });
});
