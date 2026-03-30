# TODO: Include tiebreak configuration in TournamentSnapshot

## Problem

`TournamentSnapshot` (returned by `toJSON()`, consumed by `fromJSON()`) does not include which tiebreaks were configured for the tournament. This means tiebreak configuration is lost during serialization/deserialization.

Currently:

```typescript
interface TournamentSnapshot {
  currentRound: number;
  games: Game[][];
  players: Player[];
  roundPairings: Record<string, PairingResult>;
  rounds: number;
}
```

No tiebreak information is stored. The `standings(tiebreaks?)` method accepts tiebreaks as a parameter, but the caller must know which tiebreaks to pass. Nothing in the snapshot preserves that choice.

## Impact

Kx8ble (the desktop tournament manager) stores tiebreak configuration in its own tab state rather than in the Tournament instance. This means:

- Tiebreak config is lost when saving/loading `.echecs` files (must be stored separately)
- Tiebreak config is lost during `Tournament.fromJSON()` reconstruction (used for result correction workaround)
- No way to round-trip tiebreak configuration through the Tournament class

## Proposed Change

### Option A: Add tiebreak IDs to snapshot

Add an optional `tiebreaks` field to `TournamentSnapshot`:

```typescript
interface TournamentSnapshot {
  currentRound: number;
  games: Game[][];
  players: Player[];
  roundPairings: Record<string, PairingResult>;
  rounds: number;
  tiebreaks?: string[];  // Ordered list of tiebreak identifiers
}
```

The identifiers are opaque strings — the Tournament class doesn't resolve them, it just preserves them. The consumer (Kx8ble) maps IDs to actual `Tiebreak` functions.

### Option B: Store tiebreak functions in Tournament

Accept tiebreaks in `TournamentOptions` and store them on the instance:

```typescript
interface TournamentOptions {
  acceleration?: AccelerationMethod;
  pairingSystem: PairingSystem;
  players: Player[];
  rounds: number;
  tiebreaks?: Tiebreak[];  // NEW
}
```

Then `standings()` uses the stored tiebreaks by default (still overridable via parameter). `toJSON()` cannot serialize functions, so this would need to coexist with Option A for snapshot support.

### Recommendation

Option A is simpler and sufficient. The Tournament class doesn't need to know about tiebreaks — it just needs to carry the configuration through serialization. The consumer resolves IDs to functions.

## Related

- `@echecs/trf` TODO for parsing TRF tags 202/212 (FIDE tiebreak specification in TRF files)
- Kx8ble tiebreak registry at `src/lib/tiebreaks.ts` maps string IDs to `Tiebreak` functions
