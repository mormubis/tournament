# Tournament

[![npm](https://img.shields.io/npm/v/@echecs/tournament)](https://www.npmjs.com/package/@echecs/tournament)
[![Test](https://github.com/mormubis/tournament/actions/workflows/test.yml/badge.svg)](https://github.com/mormubis/tournament/actions/workflows/test.yml)
[![Coverage](https://codecov.io/gh/mormubis/tournament/branch/main/graph/badge.svg)](https://codecov.io/gh/mormubis/tournament)
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
import { dutch } from '@echecs/swiss';
import type { Player } from '@echecs/tournament';

const players: Player[] = [
  { id: 'alice', rating: 2100 },
  { id: 'bob', rating: 1950 },
  { id: 'carol', rating: 1870 },
  { id: 'dave', rating: 1820 },
];

const tournament = new Tournament({
  pairingSystem: dutch,
  players,
  rounds: 3,
});

// Round 1
const round1 = tournament.pairRound();
// round1.pairings = [{ whiteId: 'alice', blackId: 'carol' }, ...]

tournament.recordResult({ whiteId: 'alice', blackId: 'carol', result: 1 });
tournament.recordResult({ whiteId: 'bob', blackId: 'dave', result: 0.5 });

// Round 2
const round2 = tournament.pairRound();
// ...record results...

// Standings
const table = tournament.standings();
// [{ playerId: 'alice', rank: 1, score: 2, tiebreaks: [] }, ...]
```

## API

### `Tournament`

```typescript
class Tournament {
  constructor(options: TournamentOptions);

  pairRound(): PairingResult;
  recordResult(game: Omit<Game, 'round'>): void;
  standings(tiebreaks?: Tiebreak[]): Standing[];

  get currentRound(): number;
  get games(): readonly Game[];
  get isComplete(): boolean;
  get players(): readonly Player[];
  get rounds(): number;

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
  acceleration?: AccelerationMethod; // e.g. bakuAcceleration()
  pairingSystem: PairingSystem; // e.g. dutch, roundRobin
  players: Player[]; // all participants
  rounds: number; // total number of rounds
}
```

Throws `RangeError` if fewer than 2 players or fewer than 1 round.

#### `pairRound()`

Generates pairings for the next round using the injected pairing system. Returns
a `PairingResult` with pairings and byes.

Throws `RangeError` if the tournament is complete or the current round has
unrecorded results.

#### `recordResult(game)`

Records a game result for the current round. The `round` field is set
automatically — pass the game without it.

```typescript
tournament.recordResult({
  whiteId: 'alice',
  blackId: 'bob',
  result: 1, // 1 = white wins, 0.5 = draw, 0 = black wins
});
```

Throws `RangeError` if the players don't match any pairing in the current round.

#### `standings(tiebreaks?)`

Returns players ranked by score, with optional tiebreaks applied in order.

```typescript
import { buchholz, sonnebornBerger } from '@echecs/swiss';

const table = tournament.standings([buchholz, sonnebornBerger]);
// [{ playerId: 'alice', rank: 1, score: 2.5, tiebreaks: [7.5, 6.25] }, ...]
```

Tiebreak functions have the signature:

```typescript
type Tiebreak = (playerId: string, players: Player[], games: Game[]) => number;
```

#### `toJSON()` / `fromJSON()`

Serialize and restore tournament state. The pairing system function must be
re-provided when restoring, since functions aren't JSON-serializable.

```typescript
const snapshot = tournament.toJSON();
const json = JSON.stringify(snapshot);

// Later...
const restored = Tournament.fromJSON(JSON.parse(json), dutch);
const nextRound = restored.pairRound();
```

### `bakuAcceleration()`

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
import { dutch } from '@echecs/swiss';

const tournament = new Tournament({
  acceleration: bakuAcceleration(players),
  pairingSystem: dutch,
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
type PairingSystem = (
  players: Player[],
  games: Game[],
  round: number,
) => PairingResult;
```

| Package                                                                    | Functions                                                       | FIDE Rules                         |
| -------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------- |
| [`@echecs/swiss`](https://www.npmjs.com/package/@echecs/swiss)             | `dutch`, `dubov`, `burstein`, `lim`, `doubleSwiss`, `swissTeam` | C.04.3, C.04.4.1-3, C.04.5, C.04.6 |
| [`@echecs/round-robin`](https://www.npmjs.com/package/@echecs/round-robin) | `roundRobin`                                                    | C.05                               |

## Types

```typescript
interface Player {
  id: string;
  rating?: number;
}

interface Game {
  blackId: string;
  result: Result;
  round: number;
  whiteId: string;
}

type Result = 0 | 0.5 | 1;

interface Pairing {
  blackId: string;
  whiteId: string;
}

interface Bye {
  playerId: string;
}

interface PairingResult {
  byes: Bye[];
  pairings: Pairing[];
}

interface Standing {
  playerId: string;
  rank: number;
  score: number;
  tiebreaks: number[];
}
```

## FIDE References

- [C.04.7 Baku Acceleration](https://handbook.fide.com/chapter/C0407202602)

## License

MIT
