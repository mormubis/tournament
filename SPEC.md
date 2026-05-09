# @echecs/tournament — Specification

Stateful chess tournament orchestrator. Drives any FIDE pairing system through a
common lifecycle: create → pair → record → standings → repeat. Zero runtime
dependencies.

---

## 1. Tournament Lifecycle

A tournament progresses through a fixed state machine. Each round evolves
through three stages:

```
create tournament
       │
       ▼
  ┌─────────┐
  │ pair    │  pairRound() → Pairings
  └────┬────┘
       │
       ▼
  ┌─────────┐
  │ Round   │  recordResult() → partial results
  └────┬────┘
       │ (all pairings have results)
       ▼
  ┌───────────────┐
  │ CompletedRound│  standings() available
  └────┬──────────┘
       │ (more rounds remain)
       └──────────────────► pair next round
       │ (all rounds complete)
       ▼
   tournament.isComplete === true
```

### Round type evolution

```typescript
// Output of pairRound() — no results yet
interface Pairings {
  byes: Bye[];
  games: Pairing[];
}

// In-progress — some pairings may have results
interface Round extends Pairings {
  games: (Game | Pairing)[];
}

// All pairings have results
interface CompletedRound extends Pairings {
  games: Game[];
}
```

`standings()` may be called at any point but reflects only completed rounds.
`pairRound()` throws if the current round is incomplete (unrecorded results
remain).

---

## 2. Pairing System Injection

The pairing algorithm is injected at construction time. The tournament has no
coupling to any specific pairing package.

```typescript
type PairingSystem = (players: Player[], rounds: CompletedRound[]) => Pairings;
```

- `players` — the full participant list with current cumulative scores
- `rounds` — all completed rounds in chronological order
- returns `Pairings` with the next round's pairings and byes

Compatible packages:

| Package               | Subpath                  | FIDE rule |
| --------------------- | ------------------------ | --------- |
| `@echecs/swiss`       | `@echecs/swiss/dutch`    | C.04.3    |
|                       | `@echecs/swiss/dubov`    | C.04.4.1  |
|                       | `@echecs/swiss/burstein` | C.04.4.2  |
|                       | `@echecs/swiss/lim`      | C.04.4.3  |
|                       | `@echecs/swiss/double`   | C.04.5    |
|                       | `@echecs/swiss/team`     | C.04.6    |
| `@echecs/round-robin` | `@echecs/round-robin`    | C.05      |

Any custom function matching the signature also works.

---

## 3. Scoring System

```typescript
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
```

Color-specific fields (e.g. `whiteWin`) fall back to their base equivalents
(e.g. `win`) when absent. Base fields fall back to `FIDE_SCORING` defaults.

### FIDE defaults (`FIDE_SCORING`)

| Result                | Points |
| --------------------- | ------ |
| `win`                 | 1      |
| `draw`                | 0.5    |
| `loss`                | 0      |
| `forfeitWin`          | 1      |
| `forfeitLoss`         | 0      |
| `fullPointBye`        | 1      |
| `halfPointBye`        | 0.5    |
| `pairingAllocatedBye` | 1      |
| `zeroPointBye`        | 0      |
| `absence`             | 0      |

Color-specific fields (`whiteWin`, `blackWin`, `whiteDraw`, `blackDraw`,
`whiteLoss`, `blackLoss`) are not present in `FIDE_SCORING` — they always
inherit from the base value.

---

## 4. Baku Acceleration (FIDE C.04.7)

**Source:** https://handbook.fide.com/chapter/C0407202602

Adds virtual points to top-half players' scores before pairing, causing stronger
players to meet earlier in the tournament.

### Group assignment

Given N players ordered by rating descending:

- **GA** — top half: size = `2 × ceil(N / 4)` players
- **GB** — rest: all remaining players

### Virtual point schedule

Let `acceleratedRounds = ceil(totalRounds / 2)`.

| Round range                                                           | GA virtual points | GB virtual points |
| --------------------------------------------------------------------- | :---------------: | :---------------: |
| 1 … `ceil(acceleratedRounds / 2)` (first half)                        |         1         |         0         |
| `ceil(acceleratedRounds / 2) + 1` … `acceleratedRounds` (second half) |        0.5        |         0         |
| `acceleratedRounds + 1` … `totalRounds`                               |         0         |         0         |

### Effect on pairing

Virtual points are added to a player's score when the list is passed to the
pairing system. They are **never** stored in game results or reflected in
standings.

### API

```typescript
function bakuAcceleration(players: Player[]): AccelerationMethod;

interface AccelerationMethod {
  virtualPoints: (player: Player, round: number, totalRounds: number) => number;
}
```

Pass the returned `AccelerationMethod` to the `Tournament` constructor via the
`acceleration` option.

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

---

## 5. Tiebreak Integration

```typescript
type Tiebreak = (
  player: string,
  rounds: CompletedRound[],
  players: Player[],
) => number;
```

- `player` — the player identifier to compute the tiebreak for
- `rounds` — all completed rounds
- `players` — all tournament participants
- returns a numeric score; higher values rank higher

Pass an ordered array of tiebreak functions to `standings()`. Tiebreaks are
applied left to right to resolve ties in score.

Compatible packages: `@echecs/buchholz`, `@echecs/sonneborn-berger`,
`@echecs/direct-encounter`, `@echecs/progressive`, `@echecs/koya`,
`@echecs/number-of-wins`, `@echecs/average-rating`,
`@echecs/performance-rating`.

---

## 6. Standings Computation

```typescript
interface Standing {
  player: string; // player identifier
  rank: number; // 1-based; tied players share the same rank
  score: number; // cumulative score across all completed rounds
  tiebreaks: number[]; // one value per tiebreak function, in order
}
```

Ranking algorithm:

1. Sort players by `score` descending.
2. For each group of players with equal score, apply tiebreaks left to right
   until the group is resolved.
3. Players who remain tied after all tiebreaks are exhausted share the same
   rank. The next rank skips the appropriate number of positions.

```typescript
const table = tournament.standings([buchholz, sonnebornBerger]);
// [{ player: 'alice', rank: 1, score: 2.5, tiebreaks: [7.5, 6.25] }, ...]
```

---

## 7. Serialization

```typescript
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
}
```

`toJSON()` returns a `TournamentData` plain object that is fully
JSON-serializable. `fromJSON()` restores a `Tournament` instance from it.

The pairing system function and the acceleration method are not serializable and
**must be re-provided**:

```typescript
const snapshot = tournament.toJSON();
const json = JSON.stringify(snapshot);

// Later...
const restored = Tournament.fromJSON(
  JSON.parse(json),
  pair,
  bakuAcceleration(players),
);
```

The `tiebreaks` field in `TournamentData` stores opaque string identifiers (e.g.
`'buchholz'`). These are preserved through serialization and round-trips intact,
but the actual tiebreak functions must be supplied by the caller when calling
`standings()`.

---

## 8. Game Types

`Game` is a discriminated union extending `Pairing`. The `forfeit` discriminant
determines which `result` values are valid and whether `rated` is allowed.

```typescript
interface Pairing {
  black: string;
  white: string;
}

type Game = Pairing &
  (
    | { forfeit?: never; rated?: boolean; result: 'white' | 'black' | 'draw' }
    | { forfeit: 'black'; rated?: never; result: 'white' }
    | { forfeit: 'white'; rated?: never; result: 'black' }
    | { forfeit: 'both'; rated?: never; result: 'none' }
  );
```

| `forfeit` | `result`                       | `rated`     | Meaning               |
| --------- | ------------------------------ | ----------- | --------------------- |
| absent    | `'white'`, `'black'`, `'draw'` | optional    | played game           |
| `'black'` | `'white'`                      | not allowed | white wins by forfeit |
| `'white'` | `'black'`                      | not allowed | black wins by forfeit |
| `'both'`  | `'none'`                       | not allowed | double forfeit        |

TypeScript enforces these constraints at compile time. Invalid combinations
(e.g. `{ forfeit: 'both', result: 'white' }`) do not typecheck.

---

## 9. Bye Types

```typescript
interface Bye {
  kind: 'full' | 'half' | 'pairing' | 'zero';
  player: string;
}
```

| `kind`      | Points (FIDE default) | FIDE reference | Description                        |
| ----------- | :-------------------: | -------------- | ---------------------------------- |
| `'full'`    |           1           | —              | full-point bye                     |
| `'half'`    |          0.5          | Art. 16.2.5    | half-point bye (requested)         |
| `'pairing'` |           1           | Art. 16.2.1    | pairing-allocated bye (odd player) |
| `'zero'`    |           0           | Art. 16.2.3    | zero-point bye (known absence)     |

---

## 10. Validation Rules

All domain violations throw `RangeError`.

| Operation        | Condition                                              | Error                                  |
| ---------------- | ------------------------------------------------------ | -------------------------------------- |
| `pairRound()`    | tournament is already complete                         | cannot pair a completed tournament     |
| `pairRound()`    | current round has unrecorded results                   | current round is not complete          |
| `recordResult()` | white/black pair not found in current round's pairings | no pairing found for the given players |
| `constructor()`  | duplicate player ids in the player list                | duplicate player id                    |
| `withdraw()`     | player id not found in the participant list            | player not found                       |
