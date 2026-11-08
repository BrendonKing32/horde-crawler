# Horde Crawler

A top-down arcade dungeon crawler for the browser, in the spirit of the classic co-op horde crawlers. Your health drains every second, monsters pour out of spawners, and you push deeper floor by floor before you run dry.

The game name is a working title.

## Play

```sh
npm install
npm run dev
```

Open the URL Vite prints. Controls:

| Action | Keyboard | Touch |
|---|---|---|
| Move | WASD / arrows | Drag on the left side |
| Fire | Space / J | FIRE button |
| Potion (clears the screen) | K / Q | POT button |
| Pick class / upgrade | 1, 2, 3 | Tap |

The start screen has a **Testing: start in** row to jump straight to any area.

## What's in it

- **Two classes.** Warden (slow, armored, heavy shots) and Ranger (fast, rapid fire, fragile).
- **Procedural floors** that change layout algorithm and theme every five floors:

  | Floors | Area | Layout | Area hazard | Enemy twist |
  |---|---|---|---|---|
  | 1–5 | Crypt | Rooms + straight corridors | Breakable coffins | Some grunts rise again unless you stomp their bones |
  | 6–10 | Caverns | Winding tunnels, ragged chambers | Cave-ins (hurt monsters too) | Biters burrow and pop up beside you |
  | 11–15 | Catacombs | 2-wide maze with walled chambers | Timed spike strips | Reapers drift through walls |
  | 16–20 | Plague Ward | Packed cells (binary space partition) | Bile pools that slow and burn | Lobber bombs leave poison clouds |
  | 21–25 | Carnival | Fenced plots, striped tents | Lights out: only eyes show | Wind-up biters; lobbers throw homing balloons |

  After floor 25 the cycle repeats, harder.
- **Every floor is guaranteed winnable.** The exit is in a locked vault, colored gates open from matching levers, and each lever, food and a potion for every reaper are reachable in the right order. The test suite plays hundreds of floors to check this.
- **Per-run leveling.** Kills and smashed spawners earn XP; each level pauses for a pick of three upgrades.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Typecheck, then build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm test` | Floor generator test suite (Vitest) |
| `npm run typecheck` | `tsc --noEmit` |

## Project layout

```
src/
  main.ts            boot + game loop
  gen/               pure floor generation (no DOM; tested directly)
    rng.ts           seeded PRNG
    layouts.ts       one layout function per area
    generator.ts     vaults, gates/levers, item placement, area features
  game/
    state.ts         the live floor (S) and newFloor()
    constants.ts     palette, area themes, class stats
    types.ts         shared types
    world.ts         collision, doors
    update.ts        per-frame simulation
    enemies.ts       enemy AI
    hazards.ts       area hazards and projectiles
    actions.ts       damage, kills, potions, spawning
    progression.ts   XP and upgrades
    render.ts        canvas drawing
    hud.ts, flow.ts, input.ts, narrator.ts, dom.ts
tests/
  generator.test.ts
```

## Deploying

`npm run build` produces a static site in `dist/` (relative asset paths, so it works from any subfolder). It drops straight onto Cloudflare Pages: build command `npm run build`, output directory `dist`.
