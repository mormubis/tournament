# Tournament

[![npm](https://img.shields.io/npm/v/@echecs/tournament)](https://www.npmjs.com/package/@echecs/tournament)
[![Coverage](https://codecov.io/gh/echecsjs/tournament/branch/main/graph/badge.svg)](https://codecov.io/gh/echecsjs/tournament)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Tournament** is a TypeScript library for orchestrating chess tournaments using
any FIDE pairing system. It provides a stateful `Tournament` class that manages
the full lifecycle — pairing rounds, recording results, computing standings —
and a `bakuAcceleration()` function implementing FIDE C.04.7. Zero runtime
dependencies.

The pairing system is injected as a function parameter. Bring your own from
[`@echecs/swiss`](https://www.npmjs.com/package/@echecs/swiss),
[`@echecs/round-robin`](https://www.npmjs.com/package/@echecs/round-robin), or a
custom implementation.

## Installation

```bash
npm install @echecs/tournament
```

## Quick Start

```typescript
import { Tournament } from '@echecs/tournament';
import { pair } from '@echecs/swiss/dutch';
import type { Game, GameKind, Player, Tiebreak } from '@echecs/tournament';

const players: Player[] = [
  { id: 'alice', rating: 2100 },
  { id: 'bob', rating: 1950 },
  { id: 'carol', rating: 1870 },
  { id: 'dave', rating: 1820 },
];

const tournament = new Tournament({
  pairingSystem: pair,
  players,
  rounds: 3,
});

// Round 1
const round1 = tournament.pairRound();
// round1.pairings = [{ black: 'carol', white: 'alice' }, ...]
// round1.byes    = [{ player: 'dave' }]

tournament.recordResult({ black: 'carol', result: 1, white: 'alice' });
tournament.recordResult({ black: 'dave', result: 0.5, white: 'bob' });

// Round 2
const round2 = tournament.pairRound();
// ...record results...

// Standings (no tiebreaks)
const table = tournament.standings();
// [{ player: 'alice', rank: 1, score: 2, tiebreaks: [] }, ...]
```

## API

### `Tournament`

```typescript
class Tournament {
  constructor(options: TournamentOptions);

  clearResult(round: number, white: string, black: string): void;
  pairRound(): PairingResult;
  recordResult(game: Game): void;
  standings(tiebreaks?: Tiebreak[]): Standing[];
  updateResult(round: number, game: Game): void;

  get currentRound(): number;
  get games(): readonly (readonly Game[])[];
  get isComplete(): boolean;
  get players(): readonly Player[];
  get rounds(): number;
  get tiebreaks(): readonly string[];

  toJSON(): TournamentSnapshot;
  static fromJSON(
    snapshot: TournamentSnapshot,
    pairingSystem: PairingSystem,
    acceleration?: AccelerationMethod,
  ): Tournament;
}
```

#### `constructor(options)`

Creates a new tournament.

```typescript
interface TournamentOptions {
  acceleration?: AccelerationMethod; // e.g. bakuAcceleration(players)
  pairingSystem: PairingSystem; // e.g. pair from @echecs/swiss/dutch
  players: Player[]; // all participants
  rounds: number; // total number of rounds
  tiebreaks?: string[]; // opaque IDs preserved through serialization
}
```

Throws `RangeError` if fewer than 2 players or fewer than 1 round.

#### `pairRound()`

Generates pairings for the next round using the injected pairing system. Returns
a `PairingResult` with pairings and byes.

Throws `RangeError` if the tournament is complete or the current round has
unrecorded results.

#### `clearResult(round, white, black)`

Removes a previously recorded result, identified by round number and player
pair. The lookup checks both color orderings, so the caller can pass `white` and
`black` in either order.

```typescript
tournament.clearResult(1, 'alice', 'carol');
```

After clearing, the round becomes incomplete and the pairing can be re-recorded
via `recordResult`.

Throws `RangeError` if the round is invalid or no matching result exists.

#### `recordResult(game)`

Records a game result for the current round.

```typescript
tournament.recordResult({
  black: 'carol',
  result: 1, // 1 = white wins, 0.5 = draw, 0 = black wins
  white: 'alice',
});
```

The optional `kind?: GameKind` field classifies the game type. When provided,
the result must be consistent with the kind (see
[GameKind validation](#gamekind-validation) below).

```typescript
tournament.recordResult({
  black: 'carol',
  kind: 'forfeit-win',
  result: 1,
  white: 'alice',
});
```

Throws `RangeError` if the players don't match any pairing in the current round,
or if `kind` and `result` are inconsistent.

#### `updateResult(round, game)`

Replaces an existing result in any round. The game is identified by the
`white`/`black` player pair (checked in both orderings). The stored game retains
its original color assignment.

```typescript
// Change round 1 result from white-wins to draw
tournament.updateResult(1, {
  black: 'carol',
  result: 0.5,
  white: 'alice',
});

// Add a kind to an existing result
tournament.updateResult(1, {
  black: 'carol',
  kind: 'forfeit-win',
  result: 1,
  white: 'alice',
});
```

Throws `RangeError` if the round is invalid, no matching result exists, or
`kind` and `result` are inconsistent.

#### `standings(tiebreaks?)`

Returns players ranked by score, with optional tiebreaks applied in order. Each
tiebreak function receives `(playerId, games, players)` and returns a number.

```typescript
import { buchholz } from '@echecs/buchholz';
import { sonnebornBerger } from '@echecs/sonneborn-berger';

const table = tournament.standings([buchholz, sonnebornBerger]);
// [{ player: 'alice', rank: 1, score: 2.5, tiebreaks: [7.5, 6.25] }, ...]
```

Tiebreak functions conform to:

```typescript
type Tiebreak = (
  playerId: string,
  games: Game[][],
  players: Player[],
) => number;
```

#### `toJSON()` / `fromJSON()`

Serialize and restore tournament state. The pairing system function must be
re-provided when restoring, since functions aren't JSON-serializable.

```typescript
const snapshot = tournament.toJSON();
const json = JSON.stringify(snapshot);

// Later...
const restored = Tournament.fromJSON(JSON.parse(json), pair);
const nextRound = restored.pairRound();
```

### `bakuAcceleration(players)`

```typescript
function bakuAcceleration(players: Player[]): AccelerationMethod;
```

Returns an `AccelerationMethod` implementing
[FIDE C.04.7 Baku Acceleration](https://handbook.fide.com/chapter/C0407202602).

Splits players into two groups (GA = top half, GB = rest) and adds virtual
points to GA players' scores in the first rounds, causing stronger players to
face each other earlier.

```typescript
import { Tournament, bakuAcceleration } from '@echecs/tournament';
import { pair } from '@echecs/swiss/dutch';

const tournament = new Tournament({
  acceleration: bakuAcceleration(players),
  pairingSystem: pair,
  players,
  rounds: 9,
});
```

Virtual points:

- **First half of accelerated rounds**: GA players get 1 point
- **Second half of accelerated rounds**: GA players get 0.5 points
- **After accelerated rounds**: 0 points
- **GB players**: always 0 points

Virtual points affect pairing only — they are never stored in the game history
or reflected in standings.

## Compatible Pairing Systems

Any function matching the `PairingSystem` signature works:

```typescript
type PairingSystem = (players: Player[], games: Game[][]) => PairingResult;
```

| Package                                                                    | Subpath                  | FIDE Rules |
| -------------------------------------------------------------------------- | ------------------------ | ---------- |
| [`@echecs/swiss`](https://www.npmjs.com/package/@echecs/swiss)             | `@echecs/swiss/dutch`    | C.04.3     |
|                                                                            | `@echecs/swiss/dubov`    | C.04.4.1   |
|                                                                            | `@echecs/swiss/burstein` | C.04.4.2   |
|                                                                            | `@echecs/swiss/lim`      | C.04.4.3   |
|                                                                            | `@echecs/swiss/double`   | C.04.5     |
|                                                                            | `@echecs/swiss/team`     | C.04.6     |
| [`@echecs/round-robin`](https://www.npmjs.com/package/@echecs/round-robin) | `@echecs/round-robin`    | C.05       |

All subpaths export a `pair` function conforming to the `PairingSystem`
signature.

## Types

```typescript
interface Player {
  id: string;
  rating?: number;
}

interface Game {
  black: string;
  kind?: GameKind; // optional: classifies unplayed rounds
  result: Result;
  white: string;
}

type GameKind =
  | 'forfeit-loss'
  | 'forfeit-win'
  | 'full-bye'
  | 'half-bye'
  | 'pairing-bye'
  | 'zero-bye';

type Result = 0 | 0.5 | 1;

interface Pairing {
  black: string;
  white: string;
}

interface Bye {
  player: string;
}

interface PairingResult {
  byes: Bye[];
  pairings: Pairing[];
}

interface Standing {
  player: string;
  rank: number;
  score: number;
  tiebreaks: number[];
}

type Tiebreak = (
  playerId: string,
  games: Game[][],
  players: Player[],
) => number;

type PairingSystem = (players: Player[], games: Game[][]) => PairingResult;

interface AccelerationMethod {
  virtualPoints: (player: Player, round: number, totalRounds: number) => number;
}

interface TournamentSnapshot {
  currentRound: number;
  games: Game[][];
  players: Player[];
  roundPairings: Record<string, PairingResult>;
  rounds: number;
  tiebreaks?: string[];
}
```

## GameKind Validation

When `kind` is provided in `recordResult` or `updateResult`, the `result` must
match. Mismatches throw `RangeError`.

| `kind`         | Required `result` | FIDE ref    |
| -------------- | ----------------- | ----------- |
| `forfeit-win`  | `1`               | Art. 16.2.2 |
| `forfeit-loss` | `0`               | Art. 16.2.4 |
| `full-bye`     | `1`               | —           |
| `half-bye`     | `0.5`             | Art. 16.2.5 |
| `pairing-bye`  | `1`               | Art. 16.2.1 |
| `zero-bye`     | `0`               | Art. 16.2.3 |

When `kind` is omitted, any result is accepted.

## FIDE References

- [C.07 Play-Off and Tie-Break Regulations](https://handbook.fide.com/chapter/TieBreakRegulations032026)
- [C.04.7 Baku Acceleration](https://handbook.fide.com/chapter/C0407202602)

## License

MIT
