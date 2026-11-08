# Horde Crawler: notes for Claude

Browser horde dungeon crawler. Vite + TypeScript, hand-rolled Canvas 2D renderer, no game engine, no runtime dependencies.

## Commands

- `npm run dev`: dev server
- `npm test`: Vitest suite (floor generator); must stay green
- `npm run typecheck`: strict `tsc --noEmit`
- `npm run build`: typecheck + production build

CI (`.github/workflows/ci.yml`) runs typecheck, tests and build on every push and PR.

## Architecture

- `src/gen/` is pure and DOM-free. `buildFloor(seed, depth)` returns 32 rows of 44 chars; the legend is at the top of `generator.ts`. Layouts per area live in `layouts.ts`; shared placement (vaults, gates, items, area features) in `generator.ts`.
- **RNG call order defines the map for a seed.** Reordering `rand.*` calls changes every seeded floor. That's allowed, but intentional only.
- Generation is validate-and-retry: `generate()` returns `null` when it can't meet the guarantees, and `buildFloor` retries with derived seeds. Keep new constraints in that style rather than patching maps afterwards.
- `src/game/state.ts` exports the live floor as `S` (an ES live binding reassigned by `newFloor`). Game modules read and mutate `S` directly; that's the intended pattern.
- Areas: `areaOf(depth)` maps floors to `AREA` ids every five floors. Area themes are in `constants.ts` (`AREAS`, same index order). Area-specific behavior checks `S.area.style` or the `plague` / `carnival` flags.
- Damage: `hurt(n)` is monster damage (scaled by armor, shows the red edge glow). `hurt(n, true)` is raw: health drain, poison, bile and reapers ignore armor.

## Guarantees the tests enforce

Every floor: exactly one start and exit; exit vault key reachable; at least one gate; each gate has one lever reachable before it; food reachable before each gate; potions at least equal to reapers; area features only in their own area. Add a test when you add a guarantee.

## Conventions

- Narrator lines: `say()` for one-offs, `sayOnce(key, text)` for first-time explanations of a mechanic.
- Prefer adding an area mechanic as a function in `hazards.ts` (environment) or a branch in `enemies.ts` (enemy twist), keyed off `S.area`.
- Colors come from `C` / `AREAS` in `constants.ts`, mirroring the CSS variables in `styles.css`.
