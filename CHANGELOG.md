# Changelog

## [3.3.0] - 2026-05-27

### Added

- `PairingOptions` interface with `trace` and `expectedRounds` fields.
- `TraceCallback` type for pairing algorithm observability.
- `onTrace` option in `Tournament` constructor — forwarded to the pairing system
  on each `pair()` call.
- `expectedRounds` is now automatically forwarded from `totalRounds` to the
  pairing system.

### Changed

- `PairingSystem` type now accepts an optional third `PairingOptions` parameter.

## [3.2.0] - 2026-05-25

### Added

- `withdrawnPlayers?: string[]` on `TournamentData` — tracks players who left
  the tournament, survives `toJSON()` roundtrips
- `startingRankMethod?: string` on `TournamentMetadata` — records how the
  initial ranking list was determined
- `Tournament` constructor now respects `withdrawnPlayers` from input data
  (excludes them from pairing)
- `withdraw()` persists the player ID to `TournamentData.withdrawnPlayers`

## [3.1.1] - 2026-05-15

### Fixed

- `pair()` now calls `onWarning` when a full-point bye is assigned, flagging it
  as deprecated per FIDE rules (VCL.17)

## [3.1.0] - 2026-05-09

### Added

- read-only getters: `completedRounds`, `currentRound`, `isComplete`,
  `metadata`, `players`, `totalRounds`

### Removed

- `fromJSON()` — use `new Tournament(data, options)` instead

## [3.0.0] - 2026-05-09

### Breaking Changes

- `Player` requires `points` and `rank` fields
- `Game` uses string results (`'white'` / `'black'` / `'draw'` / `'none'`)
  instead of numeric `Result`
- `GameKind` removed — replaced by `forfeit` on `Game` and `kind` on `Bye`
- `TournamentOptions` / `TournamentSnapshot` / `PairingResult` removed
- constructor takes `TournamentData` + options instead of `TournamentOptions`
- `PairingSystem` signature takes `CompletedRound[]` instead of `Game[][]`
- `Tiebreak` signature takes `CompletedRound[]` instead of `Game[][]`
- `withdraw()` no longer removes players from `players[]`
- rounds no longer auto-promote on last `record()` — `pair()` promotes

### Added

- `Player.points` as source of truth — maintained by `record()`, `correct()`,
  `clear()`, `adjust()`, `pair()`. `standings()` reads it directly.
- `Player.rank` maintained — `standings()` writes back `Player.rank`
- tiebreaks registry — constructor accepts
  `tiebreaks?: Record<string, Tiebreak>`
- `onWarning` callback — warns at construction for unresolved tiebreak IDs
- `ScoringSystem` — 17-field scoring config with color-specific fallbacks
- `FIDE_SCORING` constant
- withdrawal tracking — `withdraw()` tracks in a `Set`, preserving player data
- round lifecycle — `Pairings` -> `Round` -> `CompletedRound`
- `PointAdjustment` — audit trail for arbiter score adjustments
- `TournamentMetadata` — report info with auto-logged comments
- FIDE metadata on `Player` — `birthDate`, `federation`, `fideId`, `name`,
  `nationalRatings`, `sex`, `startingRank`, `title`
- new types: `AcceleratedRound`, `CompletedRound`, `NationalRating`, `Pairings`,
  `PlayerAcceleration`, `PointAdjustment`, `ProhibitedPairing`, `Round`,
  `ScoringSystem`, `Team`, `TournamentData`, `TournamentMetadata`

## [2.1.2] - 2026-04-17

### Fixed

- Added top-level `types` field to `package.json` for TypeScript configs that
  don't resolve types through `exports` conditions.

## 2.1.1 — 2026-04-09

### Fixed

- Corrected getter return types to `readonly` (`games`, `players`, `tiebreaks`).
- Documented `TournamentSnapshot`, `AccelerationMethod`, `PairingSystem`, and
  `Result` types.

## 2.1.0 — 2026-03-30

### Added

- `updateResult(round, game)` — replace a recorded game result in any round.
- `clearResult(round, white, black)` — remove a recorded result from any round.
- `GameKind` validation — `recordResult` and `updateResult` enforce consistency
  between `kind` and `result` (e.g. `forfeit-win` requires `result: 1`).

## 0.1.1 — 2026-03-22

### Fixed

- Triggered initial npm publish (version check required a version change)

## 0.1.0 — 2026-03-22

- Initial release
