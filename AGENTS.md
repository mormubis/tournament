# AGENTS.md

Agent guidance for the `@echecs/tournament` package — stateful chess tournament
orchestrator for any FIDE pairing system.

**See also:** [`REFERENCES.md`](REFERENCES.md) | [`SPEC.md`](SPEC.md)

See the root `AGENTS.md` for workspace-wide conventions (package manager,
TypeScript settings, formatting, naming, testing, ESLint rules).

**Backlog:** tracked in
[GitHub Issues](https://github.com/echecsjs/tournament/issues).

---

## Project Overview

Thin orchestration library, no runtime dependencies. Provides a stateful
`Tournament` class that drives any pairing system through a common lifecycle:
create → pair → record results → standings → repeat. Also exports
`bakuAcceleration()` implementing FIDE C.04.7 Baku Acceleration Method.

The pairing system is injected as a function parameter — the consumer provides
it from `@echecs/swiss`, `@echecs/round-robin`, or a custom implementation.

---

## Commands

### Build

```bash
pnpm run build          # bundle TypeScript → dist/ via tsdown
```

### Test

```bash
pnpm run test                          # run all tests once
pnpm run test:watch                    # watch mode
pnpm run test:coverage                 # with coverage report

# Run a single test file
pnpm run test src/__tests__/tournament.spec.ts

# Run a single test by name (substring match)
pnpm run test -- --reporter=verbose -t "standings"
```

### Lint & Format

```bash
pnpm run lint           # ESLint + tsc type-check (auto-fixes style issues)
pnpm run lint:ci        # strict — zero warnings allowed, no auto-fix
pnpm run lint:style     # ESLint only (auto-fixes)
pnpm run lint:types     # tsc --noEmit type-check only
pnpm run format         # Prettier (writes changes)
pnpm run format:ci      # Prettier check only (no writes)
```

### Full pre-PR check

```bash
pnpm lint && pnpm test && pnpm build
```

---

## FIDE References

- C.04.7 Baku Acceleration: https://handbook.fide.com/chapter/C0407202602

---

## Architecture Notes

- **ESM-only** — the package ships only ESM. Do not add a CJS build.
- No runtime dependencies — keep it that way.
- The `Tournament` class uses private fields (`#`) for encapsulation.
- The pairing system is provided via constructor injection — no coupling to
  `@echecs/swiss` or `@echecs/round-robin` at runtime.
- `toJSON()` / `fromJSON()` enable serialization. The pairing system function
  must be re-provided when restoring from JSON since functions aren't
  serializable.
- Baku Acceleration creates ephemeral virtual-point games that are passed to the
  pairing system but never stored in the tournament's game history.
- All interface fields sorted alphabetically (`sort-keys` is an ESLint error).
- Always use `.js` extensions on relative imports (NodeNext resolution).

---

## Types

`Game` is a discriminated union extending `Pairing`. Forfeits and byes are
separate concerns:

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

interface Bye {
  kind: 'full' | 'half' | 'pairing' | 'zero';
  player: string;
}
```

`Player` has required `id`, `points`, and `rank`. Optional FIDE metadata:

```typescript
interface Player {
  birthDate?: string;
  federation?: string;
  fideId?: string;
  id: string;
  name?: string;
  nationalRatings?: NationalRating[];
  points: number;
  rank: number;
  rating?: number;
  sex?: 'm' | 'w';
  startingRank?: number;
  title?: 'CM' | 'FM' | 'GM' | 'IM' | 'WCM' | 'WFM' | 'WGM' | 'WIM';
}
```

Rounds evolve: `Pairings` → `Round` → `CompletedRound`:

```typescript
interface Pairings {
  byes: Bye[];
  games: Pairing[];
}
interface Round extends Pairings {
  games: (Pairing | Game)[];
}
interface CompletedRound extends Pairings {
  games: Game[];
}
```

`TournamentData` is the serializable plain data interface. `Tournament` is the
class that wraps it.

`Standing` uses `player` (not `playerId`):

```typescript
interface Standing {
  player: string;
  rank: number;
  score: number;
  tiebreaks: number[];
}
```

## Pairing System Signature

```typescript
type PairingSystem = (players: Player[], rounds: CompletedRound[]) => Pairings;
```

## Tiebreak Signature

```typescript
type Tiebreak = (
  player: string,
  rounds: CompletedRound[],
  players: Player[],
) => number;
```

Pass an ordered array of tiebreak functions to
`tournament.standings(tiebreaks)`.

---

## Validation

- `RangeError` for: pairing a completed tournament, recording a result for a
  non-existent pairing, pairing when current round is incomplete, entering a
  duplicate player, withdrawing a non-existent player.

---

## Error Handling

- Throw `RangeError` for domain violations.
