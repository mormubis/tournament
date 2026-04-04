# Backlog

Last updated: 2026-04-04

## Completed

- [x] Tiebreak IDs in `TournamentSnapshot` — `tiebreaks?: string[]` in
      `TournamentOptions` and `TournamentSnapshot`, round-tripped through
      `toJSON()`/`fromJSON()`.
- [x] Fix README — correct `dutch` → `pair` imports, update Compatible Pairing
      Systems table to show subpath exports, verify `GameKind` type.
- [x] `updateResult` API — replace a recorded game result without appending.
- [x] `clearResult` API — undo a recorded result.
- [x] `GameKind` support — distinguish forfeits from regular results.
