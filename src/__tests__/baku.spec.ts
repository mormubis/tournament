import { describe, expect, it } from 'vitest';

import { bakuAcceleration } from '../baku.js';

import type { Player } from '../types.js';

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, index) => ({
    id: String(index + 1),
    points: 0,
    rank: index + 1,
  }));
}

describe('bakuAcceleration', () => {
  describe('GA/GB split', () => {
    it('splits 4 players: GA=2, GB=2', () => {
      // gaSize = 2 * ceil(4/4) = 2
      const players = makePlayers(4);
      const accumulator = bakuAcceleration(players);
      // GA players (1,2) get virtual points in round 1 of 9
      expect(accumulator.virtualPoints(players[0]!, 1, 9)).toBeGreaterThan(0);
      expect(accumulator.virtualPoints(players[1]!, 1, 9)).toBeGreaterThan(0);
      // GB players (3,4) get 0
      expect(accumulator.virtualPoints(players[2]!, 1, 9)).toBe(0);
      expect(accumulator.virtualPoints(players[3]!, 1, 9)).toBe(0);
    });

    it('splits 8 players: GA=4, GB=4', () => {
      // gaSize = 2 * ceil(8/4) = 4
      const players = makePlayers(8);
      const accumulator = bakuAcceleration(players);
      for (let index = 0; index < 4; index++) {
        expect(
          accumulator.virtualPoints(players[index]!, 1, 9),
        ).toBeGreaterThan(0);
      }
      for (let index = 4; index < 8; index++) {
        expect(accumulator.virtualPoints(players[index]!, 1, 9)).toBe(0);
      }
    });

    it('splits 10 players: GA=6, GB=4', () => {
      // gaSize = 2 * ceil(10/4) = 2 * 3 = 6
      const players = makePlayers(10);
      const accumulator = bakuAcceleration(players);
      for (let index = 0; index < 6; index++) {
        expect(
          accumulator.virtualPoints(players[index]!, 1, 9),
        ).toBeGreaterThan(0);
      }
      for (let index = 6; index < 10; index++) {
        expect(accumulator.virtualPoints(players[index]!, 1, 9)).toBe(0);
      }
    });

    it('splits 161 players: GA=82, GB=79', () => {
      // gaSize = 2 * ceil(161/4) = 2 * 41 = 82
      const players = makePlayers(161);
      const accumulator = bakuAcceleration(players);
      for (let index = 0; index < 82; index++) {
        expect(
          accumulator.virtualPoints(players[index]!, 1, 9),
        ).toBeGreaterThan(0);
      }
      for (let index = 82; index < 161; index++) {
        expect(accumulator.virtualPoints(players[index]!, 1, 9)).toBe(0);
      }
    });
  });

  describe('virtual points', () => {
    // 9-round tournament: acceleratedRounds = ceil(9/2) = 5
    //   firstHalf = ceil(5/2) = 3
    //   Rounds 1-3: GA gets 1 point
    //   Rounds 4-5: GA gets 0.5 points
    //   Rounds 6-9: 0 points

    it('GA gets 1 point in first half of accelerated rounds', () => {
      const players = makePlayers(8);
      const accumulator = bakuAcceleration(players);
      const gaPlayer = players[0]!;
      expect(accumulator.virtualPoints(gaPlayer, 1, 9)).toBe(1);
      expect(accumulator.virtualPoints(gaPlayer, 2, 9)).toBe(1);
      expect(accumulator.virtualPoints(gaPlayer, 3, 9)).toBe(1);
    });

    it('GA gets 0.5 points in second half of accelerated rounds', () => {
      const players = makePlayers(8);
      const accumulator = bakuAcceleration(players);
      const gaPlayer = players[0]!;
      expect(accumulator.virtualPoints(gaPlayer, 4, 9)).toBe(0.5);
      expect(accumulator.virtualPoints(gaPlayer, 5, 9)).toBe(0.5);
    });

    it('GA gets 0 points after accelerated rounds', () => {
      const players = makePlayers(8);
      const accumulator = bakuAcceleration(players);
      const gaPlayer = players[0]!;
      expect(accumulator.virtualPoints(gaPlayer, 6, 9)).toBe(0);
      expect(accumulator.virtualPoints(gaPlayer, 7, 9)).toBe(0);
      expect(accumulator.virtualPoints(gaPlayer, 8, 9)).toBe(0);
      expect(accumulator.virtualPoints(gaPlayer, 9, 9)).toBe(0);
    });

    it('GB always gets 0 points', () => {
      const players = makePlayers(8);
      const accumulator = bakuAcceleration(players);
      const gbPlayer = players[4]!;
      for (let round = 1; round <= 9; round++) {
        expect(accumulator.virtualPoints(gbPlayer, round, 9)).toBe(0);
      }
    });
  });
});
