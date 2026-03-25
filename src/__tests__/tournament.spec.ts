import { describe, expect, it } from 'vitest';

import { bakuAcceleration } from '../baku.js';
import { Tournament } from '../tournament.js';

import type {
  Bye,
  Game,
  Pairing,
  PairingResult,
  PairingSystem,
  Player,
  Tiebreak,
} from '../types.js';

const tiebreakFavorA: Tiebreak = (playerId) => (playerId === 'a' ? 1 : 0);
const tiebreakConstant: Tiebreak = () => 42;

const mockPairingSystem: PairingSystem = (players) => {
  const pairings: Pairing[] = [];
  for (let index = 0; index < players.length - 1; index += 2) {
    pairings.push({
      black: players[index + 1]!.id,
      white: players[index]!.id,
    });
  }
  const byes: Bye[] =
    players.length % 2 === 0 ? [] : [{ player: players.at(-1)!.id }];
  return { byes, pairings };
};

const players: Player[] = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];

describe('Tournament', () => {
  describe('constructor', () => {
    it('creates a tournament with valid options', () => {
      const t = new Tournament({
        pairingSystem: mockPairingSystem,
        players,
        rounds: 3,
      });
      expect(t.rounds).toBe(3);
      expect(t.players).toHaveLength(4);
    });

    it('throws RangeError for fewer than 2 players', () => {
      expect(
        () =>
          new Tournament({
            pairingSystem: mockPairingSystem,
            players: [{ id: 'a' }],
            rounds: 1,
          }),
      ).toThrow(RangeError);
    });

    it('throws RangeError for fewer than 1 round', () => {
      expect(
        () =>
          new Tournament({
            pairingSystem: mockPairingSystem,
            players,
            rounds: 0,
          }),
      ).toThrow(RangeError);
    });
  });

  describe('getters', () => {
    it('players returns the registered players', () => {
      const t = new Tournament({
        pairingSystem: mockPairingSystem,
        players,
        rounds: 1,
      });
      expect(t.players).toEqual(players);
    });

    it('rounds returns total round count', () => {
      const t = new Tournament({
        pairingSystem: mockPairingSystem,
        players,
        rounds: 5,
      });
      expect(t.rounds).toBe(5);
    });

    it('currentRound starts at 0', () => {
      const t = new Tournament({
        pairingSystem: mockPairingSystem,
        players,
        rounds: 3,
      });
      expect(t.currentRound).toBe(0);
    });

    it('games starts empty', () => {
      const t = new Tournament({
        pairingSystem: mockPairingSystem,
        players,
        rounds: 3,
      });
      expect(t.games).toHaveLength(0);
    });

    it('isComplete starts as false', () => {
      const t = new Tournament({
        pairingSystem: mockPairingSystem,
        players,
        rounds: 3,
      });
      expect(t.isComplete).toBe(false);
    });
  });

  describe('pairRound()', () => {
    it('returns pairings for round 1', () => {
      const t = new Tournament({
        pairingSystem: mockPairingSystem,
        players,
        rounds: 3,
      });
      const result = t.pairRound();
      expect(result.pairings).toHaveLength(2);
      expect(result.byes).toHaveLength(0);
    });

    it('advances currentRound to 1', () => {
      const t = new Tournament({
        pairingSystem: mockPairingSystem,
        players,
        rounds: 3,
      });
      t.pairRound();
      expect(t.currentRound).toBe(1);
    });

    it('throws RangeError when tournament is complete', () => {
      const t = new Tournament({
        pairingSystem: mockPairingSystem,
        players,
        rounds: 1,
      });
      const result = t.pairRound();
      for (const pairing of result.pairings) {
        t.recordResult({
          black: pairing.black,
          result: 1,
          white: pairing.white,
        });
      }
      expect(() => t.pairRound()).toThrow(RangeError);
    });

    it('throws RangeError when current round has unrecorded results', () => {
      const t = new Tournament({
        pairingSystem: mockPairingSystem,
        players,
        rounds: 3,
      });
      t.pairRound();
      // Don't record results — pair again should throw
      expect(() => t.pairRound()).toThrow(RangeError);
    });
  });

  describe('recordResult()', () => {
    it('records a game result', () => {
      const t = new Tournament({
        pairingSystem: mockPairingSystem,
        players,
        rounds: 3,
      });
      t.pairRound();
      t.recordResult({ black: 'b', result: 1, white: 'a' });
      expect(t.games[0]).toHaveLength(1);
    });

    it('throws RangeError for a non-existent pairing', () => {
      const t = new Tournament({
        pairingSystem: mockPairingSystem,
        players,
        rounds: 3,
      });
      t.pairRound();
      expect(() =>
        t.recordResult({ black: 'z', result: 1, white: 'x' }),
      ).toThrow(RangeError);
    });

    it('throws RangeError when no round has been paired yet', () => {
      const t = new Tournament({
        pairingSystem: mockPairingSystem,
        players,
        rounds: 3,
      });
      expect(() =>
        t.recordResult({ black: 'b', result: 1, white: 'a' }),
      ).toThrow(RangeError);
    });

    it('games accumulate across rounds', () => {
      const t = new Tournament({
        pairingSystem: mockPairingSystem,
        players,
        rounds: 3,
      });

      const r1 = t.pairRound();
      for (const p of r1.pairings) {
        t.recordResult({ black: p.black, result: 0.5, white: p.white });
      }

      const r2 = t.pairRound();
      for (const p of r2.pairings) {
        t.recordResult({ black: p.black, result: 0.5, white: p.white });
      }

      expect(t.games.flat()).toHaveLength(4);
    });
  });

  describe('standings()', () => {
    it('returns empty array when no players (all score 0)', () => {
      const t = new Tournament({
        pairingSystem: mockPairingSystem,
        players,
        rounds: 1,
      });
      const s = t.standings();
      expect(s).toHaveLength(4);
      expect(s.every((x) => x.score === 0)).toBe(true);
    });

    it('computes scores from recorded games', () => {
      const t = new Tournament({
        pairingSystem: mockPairingSystem,
        players,
        rounds: 1,
      });
      const r1 = t.pairRound();
      // pairings: a vs b, c vs d — white wins each
      for (const p of r1.pairings) {
        t.recordResult({ black: p.black, result: 1, white: p.white });
      }
      const s = t.standings();
      const a = s.find((x) => x.player === 'a')!;
      const b = s.find((x) => x.player === 'b')!;
      expect(a.score).toBe(1);
      expect(b.score).toBe(0);
    });

    it('ranks players by score descending', () => {
      const t = new Tournament({
        pairingSystem: mockPairingSystem,
        players,
        rounds: 1,
      });
      const r1 = t.pairRound();
      for (const p of r1.pairings) {
        t.recordResult({ black: p.black, result: 1, white: p.white });
      }
      const s = t.standings();
      expect(s[0]!.rank).toBe(1);
      expect(s[0]!.score).toBeGreaterThanOrEqual(s[1]!.score);
    });

    it('applies tiebreak functions in order', () => {
      const t = new Tournament({
        pairingSystem: mockPairingSystem,
        players: [{ id: 'a' }, { id: 'b' }],
        rounds: 1,
      });
      t.pairRound();
      t.recordResult({ black: 'b', result: 0.5, white: 'a' });
      // Both have score 0.5; tiebreak returns higher value for 'a'
      const s = t.standings([tiebreakFavorA]);
      expect(s[0]!.player).toBe('a');
      expect(s[0]!.rank).toBe(1);
      expect(s[1]!.rank).toBe(2);
    });

    it('assigns same rank to tied players', () => {
      const t = new Tournament({
        pairingSystem: mockPairingSystem,
        players: [{ id: 'a' }, { id: 'b' }],
        rounds: 1,
      });
      t.pairRound();
      t.recordResult({ black: 'b', result: 0.5, white: 'a' });
      const s = t.standings(); // no tiebreaks → tied
      expect(s[0]!.rank).toBe(1);
      expect(s[1]!.rank).toBe(1);
    });

    it('works with no tiebreaks argument', () => {
      const t = new Tournament({
        pairingSystem: mockPairingSystem,
        players,
        rounds: 1,
      });
      expect(() => t.standings()).not.toThrow();
      expect(t.standings()).toHaveLength(4);
    });

    it('populates tiebreak values in standing entries', () => {
      const t = new Tournament({
        pairingSystem: mockPairingSystem,
        players: [{ id: 'a' }, { id: 'b' }],
        rounds: 1,
      });
      t.pairRound();
      t.recordResult({ black: 'b', result: 1, white: 'a' });
      const s = t.standings([tiebreakConstant]);
      expect(s[0]!.tiebreaks).toEqual([42]);
    });
  });

  describe('serialization', () => {
    it('toJSON returns a plain serializable object', () => {
      const t = new Tournament({
        pairingSystem: mockPairingSystem,
        players,
        rounds: 2,
      });
      const r1 = t.pairRound();
      for (const p of r1.pairings) {
        t.recordResult({ black: p.black, result: 1, white: p.white });
      }
      const json = t.toJSON();
      expect(json.currentRound).toBe(1);
      expect(json.games.flat()).toHaveLength(2);
      expect(json.rounds).toBe(2);
      // eslint-disable-next-line unicorn/prefer-structured-clone
      expect(JSON.parse(JSON.stringify(json))).toEqual(json);
    });

    it('fromJSON restores tournament state', () => {
      const t = new Tournament({
        pairingSystem: mockPairingSystem,
        players,
        rounds: 2,
      });
      const r1 = t.pairRound();
      for (const p of r1.pairings) {
        t.recordResult({ black: p.black, result: 1, white: p.white });
      }
      const json = t.toJSON();
      const restored = Tournament.fromJSON(json, mockPairingSystem);
      expect(restored.currentRound).toBe(t.currentRound);
      expect(restored.games).toEqual(t.games);
      expect(restored.rounds).toBe(t.rounds);
      expect(restored.players).toEqual(t.players);
    });

    it('restored tournament can continue pairing', () => {
      const t = new Tournament({
        pairingSystem: mockPairingSystem,
        players,
        rounds: 2,
      });
      const r1 = t.pairRound();
      for (const p of r1.pairings) {
        t.recordResult({ black: p.black, result: 1, white: p.white });
      }
      const restored = Tournament.fromJSON(t.toJSON(), mockPairingSystem);
      expect(() => restored.pairRound()).not.toThrow();
      expect(restored.currentRound).toBe(2);
    });

    it('round-trips preserve all state', () => {
      const t = new Tournament({
        pairingSystem: mockPairingSystem,
        players,
        rounds: 2,
      });
      const r1 = t.pairRound();
      for (const p of r1.pairings) {
        t.recordResult({ black: p.black, result: 0.5, white: p.white });
      }
      const snap1 = t.toJSON();
      const restored = Tournament.fromJSON(snap1, mockPairingSystem);
      const snap2 = restored.toJSON();
      expect(snap2).toEqual(snap1);
    });
  });

  describe('acceleration integration', () => {
    it('virtual points affect pairing system input but not stored games', () => {
      const acceleratedPlayers: Player[] = [
        { id: 'a' },
        { id: 'b' },
        { id: 'c' },
        { id: 'd' },
      ];
      // gaSize = 2 * ceil(4/4) = 2 → GA = [a, b], GB = [c, d]
      const acceleration = bakuAcceleration(acceleratedPlayers);

      let capturedGames: Game[][] = [];
      const spyPairingSystem: PairingSystem = (
        spyPlayers,
        games,
      ): PairingResult => {
        capturedGames = [...games];
        const pairings: Pairing[] = [];
        for (let index = 0; index < spyPlayers.length - 1; index += 2) {
          pairings.push({
            black: spyPlayers[index + 1]!.id,
            white: spyPlayers[index]!.id,
          });
        }
        return { byes: [], pairings };
      };

      const t = new Tournament({
        acceleration,
        pairingSystem: spyPairingSystem,
        players: acceleratedPlayers,
        rounds: 9,
      });

      t.pairRound();

      // Virtual games are prepended as extra round (index 0)
      const virtualGames = capturedGames[0] ?? [];
      expect(virtualGames.length).toBeGreaterThan(0);

      // GA players (a, b) each have a virtual game with 1 virtual point (round 1 of 9)
      const virtualForA = virtualGames.find((g) => g.white === 'a');
      expect(virtualForA).toBeDefined();
      expect(virtualForA?.result).toBe(1);

      // GB players (c, d) have no virtual games
      expect(virtualGames.some((g) => g.white === 'c')).toBe(false);
      expect(virtualGames.some((g) => g.white === 'd')).toBe(false);

      // tournament.games does NOT contain virtual games — round array is empty
      expect(t.games.flat()).toHaveLength(0);
    });

    it('works end-to-end with acceleration', () => {
      const acceleratedPlayers: Player[] = [
        { id: 'a' },
        { id: 'b' },
        { id: 'c' },
        { id: 'd' },
      ];
      const acceleration = bakuAcceleration(acceleratedPlayers);

      const t = new Tournament({
        acceleration,
        pairingSystem: mockPairingSystem,
        players: acceleratedPlayers,
        rounds: 3,
      });

      // Pair and record all 3 rounds
      for (let round = 0; round < 3; round++) {
        const result = t.pairRound();
        for (const p of result.pairings) {
          t.recordResult({ black: p.black, result: 1, white: p.white });
        }
      }

      expect(t.isComplete).toBe(true);
      expect(t.currentRound).toBe(3);

      const s = t.standings();
      expect(s).toHaveLength(4);
      // All scores should be non-negative and sum correctly
      const totalScore = s.reduce((sum, entry) => sum + entry.score, 0);
      // 3 rounds × 2 games per round × 1 point per game = 6 total points
      expect(totalScore).toBe(6);

      // Games stored are only real games (no virtual)
      expect(t.games.flat()).toHaveLength(6);
    });
  });

  describe('full lifecycle', () => {
    it('completes a 1-round tournament and reports isComplete', () => {
      const t = new Tournament({
        pairingSystem: mockPairingSystem,
        players,
        rounds: 1,
      });

      expect(t.isComplete).toBe(false);

      const r1 = t.pairRound();
      expect(t.currentRound).toBe(1);
      expect(t.isComplete).toBe(false);

      for (const p of r1.pairings) {
        t.recordResult({ black: p.black, result: 1, white: p.white });
      }

      expect(t.isComplete).toBe(true);
    });

    it('completes a 2-round tournament pair→record→pair→record→isComplete', () => {
      const t = new Tournament({
        pairingSystem: mockPairingSystem,
        players,
        rounds: 2,
      });

      const r1 = t.pairRound();
      for (const p of r1.pairings) {
        t.recordResult({ black: p.black, result: 1, white: p.white });
      }
      expect(t.isComplete).toBe(false);

      const r2 = t.pairRound();
      for (const p of r2.pairings) {
        t.recordResult({ black: p.black, result: 1, white: p.white });
      }

      expect(t.currentRound).toBe(2);
      expect(t.isComplete).toBe(true);
    });
  });
});
