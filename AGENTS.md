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

The `Game` type carries an optional `kind?: GameKind` field to classify unplayed
rounds:

```typescript
type GameKind =
  | 'forfeit-loss'
  | 'forfeit-win'
  | 'full-bye'
  | 'half-bye'
  | 'pairing-bye'
  | 'zero-bye';

interface Game {
  black: string;
  kind?: GameKind;
  result: Result;
  white: string;
}
```

`Pairing` and `Bye` use `black`/`white`/`player` (plain string ids, not nested
objects):

```typescript
interface Pairing {
  black: string;
  white: string;
}

interface Bye {
  player: string;
}
```

`Standing` uses `player` (not `playerId`):

```typescript
interface Standing {
  player: string;
  rank: number;
  score: number;
  tiebreaks: number[];
}
```

## Unified Pairing Interface

All pairing systems consumed by `Tournament` must conform to:

```typescript
type PairingSystem = (
  players: Standing[],
  games: Game[][],
  options?: object,
) => { pairings: Pairing[]; byes: Bye[] };
```

## Tiebreak Signature

Tiebreak functions have this signature:

```typescript
type Tiebreak = (
  playerId: string,
  games: Game[][],
  players: Player[],
) => number;
```

Pass an ordered array of tiebreak functions to
`tournament.standings(tiebreaks)`.

---

## Validation

- `RangeError` for: fewer than 2 players, fewer than 1 round, pairing a
  completed tournament, recording a result for a non-existent pairing, pairing
  when current round is incomplete.

---

## Error Handling

- Throw `RangeError` for domain violations.
