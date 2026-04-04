# Backlog

Last updated: 2026-04-04

## Pending

- [ ] **Tiebreak IDs in `TournamentSnapshot`** — add optional
      `tiebreaks?: string[]` so tiebreak configuration survives serialization.
      See `docs/plans/TODO-tiebreak-snapshot.md`.

## Completed

- [x] Fix README — correct `dutch` → `pair` imports, update Compatible Pairing
      Systems table to show subpath exports, verify `GameKind` type.
- [x] `updateResult` API — replace a recorded game result without appending.
- [x] `clearResult` API — undo a recorded result.
- [x] `GameKind` support — distinguish forfeits from regular results.
