/** Area hazards and thrown projectiles. */
import { C, T } from "./constants";
import { highTide, inAstralBeam } from "./area-mechanics";
import { hurt, killEnemy } from "./actions";
import { pop, sayOnce } from "./narrator";
import { S } from "./state";
import { blocked, move, solidAt } from "./world";

export function updateHazards(dt: number) {
  bombs(dt);
  enemyShots(dt);
  const inCloud = clouds(dt);
  const onPool = pools(dt);
  const flooded = S.area.style === "archive" && highTide(S.time);
  S.p.slowF = inCloud ? 0.55 : onPool || flooded ? 0.65 : 1;
  if (flooded) sayOnce("tide", "The water is rising. The drowned move faster.");
  poison(dt, inCloud);
  lightsOut(dt);
  balloons(dt);
  caveIns(dt);
  spikes();
  bones(dt);
  drowned(dt, flooded);
  conveyors(dt);
  spores();
  astralBeam();
}

function enemyShots(dt: number) {
  const remaining = [];
  for (const shot of S.enemyShots) {
    const travel = Math.min(dt, shot.life), steps = Math.max(1, Math.ceil(Math.hypot(shot.vx, shot.vy) * travel / 8));
    let hit = false;
    for (let i = 0; i < steps; i++) {
      shot.x += shot.vx * travel / steps; shot.y += shot.vy * travel / steps;
      if (solidAt(Math.floor(shot.x / T), Math.floor(shot.y / T), true)) { hit = true; break; }
      if (Math.hypot(shot.x - S.p.x, shot.y - S.p.y) < S.p.r + 3) { hurt(14); hit = true; break; }
    }
    shot.life -= dt;
    if (!hit && shot.life > 0) remaining.push(shot);
  }
  S.enemyShots = remaining;
}

/** Lobber bombs land after 1.15s; in the plague ward they leave a poison cloud. */
function bombs(dt: number) {
  const p = S.p;
  for (const b of S.bombs) {
    b.t += dt;
    if (b.t < b.dur) continue;
    b.dead = true;
    S.booms.push({ x: b.tx, y: b.ty, t: 0.35 });
    if (S.area.plague) S.clouds.push({ x: b.tx, y: b.ty, t: 4, r: 40, seed: Math.random() * 9 });
    if (Math.hypot(p.x - b.tx, p.y - b.ty) < 34) hurt(28);
  }
  S.bombs = S.bombs.filter((b) => !b.dead);
}

function clouds(dt: number): boolean {
  const p = S.p;
  let inside = false;
  for (const c of S.clouds) { c.t -= dt; if (Math.hypot(p.x - c.x, p.y - c.y) < c.r) inside = true; }
  S.clouds = S.clouds.filter((c) => c.t > 0);
  return inside;
}

/** Plague ward bile pools: slow and burn 2 health/sec. */
function pools(dt: number): boolean {
  const p = S.p;
  const on = S.pools.size > 0 && S.pools.has(Math.floor(p.y / T) * S.cols + Math.floor(p.x / T));
  if (!on) { p.poolT = 0; return false; }
  p.poolT += dt;
  sayOnce("pool", "Bile. It clings and burns.");
  while (p.poolT >= 0.5) { p.poolT -= 0.5; hurt(1, true); p.hurt = Math.min(1, p.hurt + 0.05); }
  return true;
}

/** Poison clouds: about 6 health/sec, ignores armor. */
function poison(dt: number, inCloud: boolean) {
  const p = S.p;
  if (!inCloud) { p.cloudT = 0; return; }
  p.cloudT += dt;
  sayOnce("cloud", "Plague cloud. It slows and sickens. Get clear.");
  while (p.cloudT >= 0.5) { p.cloudT -= 0.5; hurt(3, true); p.hurt = Math.min(1, p.hurt + 0.12); }
}

/** Carnival: bulbs flicker for ~1.2s, then go dark for 3.5s every 12-18s. */
function lightsOut(dt: number) {
  if (!S.area.carnival) return;
  S.lightsT -= dt;
  S.flick = !S.dark && S.lightsT < 1.2;
  if (S.lightsT > 0) return;
  S.dark = !S.dark;
  S.lightsT = S.dark ? 3.5 : 12 + Math.random() * 6;
  if (S.dark) sayOnce("dark", "Lights out. Watch for eyes.");
}

/** Carnival balloons drift toward the player (slower than walking), pop on contact for 15. */
function balloons(dt: number) {
  const p = S.p;
  for (const b of S.balloons) {
    const bx = p.x - b.x, by = p.y - b.y, bd = Math.hypot(bx, by) || 1;
    b.vx += ((bx / bd) * 58 - b.vx) * dt * 0.9;
    b.vy += ((by / bd) * 58 - b.vy) * dt * 0.9;
    b.x += b.vx * dt; b.y += b.vy * dt; b.t -= dt;
    if (bd < p.r + 9) { b.dead = true; hurt(15); S.booms.push({ x: b.x, y: b.y, t: 0.25 }); }
    else if (b.t <= 0) { b.dead = true; S.booms.push({ x: b.x, y: b.y, t: 0.2 }); }
  }
  S.balloons = S.balloons.filter((b) => !b.dead);
}

/** Caverns: a telegraphed rock lands near the player every 4.5-8s, hurting player and monsters. */
function caveIns(dt: number) {
  if (S.area.style !== "rock") return;
  const p = S.p;
  S.rockT -= dt;
  if (S.rockT <= 0) {
    S.rockT = 4.5 + Math.random() * 3.5;
    for (let t = 0; t < 10; t++) {
      const x = p.x + (Math.random() - 0.5) * 6 * T, y = p.y + (Math.random() - 0.5) * 6 * T;
      if (solidAt(Math.floor(x / T), Math.floor(y / T))) continue;
      S.rocks.push({ x, y, t: 0, dur: 1.3 });
      sayOnce("rock", "The ceiling is coming down. Watch for shadows.");
      break;
    }
  }
  for (const r of S.rocks) {
    r.t += dt;
    if (r.t < r.dur) continue;
    r.dead = true;
    S.booms.push({ x: r.x, y: r.y, t: 0.35 });
    if (Math.hypot(p.x - r.x, p.y - r.y) < 30) hurt(25);
    for (const e of S.enemies)
      if (!e.dead && e.type !== "reaper" && !e.under && Math.hypot(e.x - r.x, e.y - r.y) < 30) { e.hp -= 3; e.hit = 0.1; if (e.hp <= 0) killEnemy(e); }
  }
  S.rocks = S.rocks.filter((r) => !r.dead);
}

/** Catacombs: strips rise for 0.8s of every 2.4s; 12 to the player, 2 to monsters, once per rise. */
function spikes() {
  const p = S.p;
  for (const tr of S.traps) {
    const f = S.time / 2.4 + (tr.ph ?? 0), ph = f % 1, id = Math.floor(f);
    tr.up = ph < 0.33;
    tr.warn = ph > 0.85;
    if (tr.lastId !== id) { tr.lastId = id; tr.hitE.clear(); tr.hitP = false; }
    if (!tr.up) continue;
    if (!tr.hitP && Math.abs(p.x - tr.x) < 16 && Math.abs(p.y - tr.y) < 16) {
      tr.hitP = true; hurt(tr.kind === "press" ? 18 : 12);
      if (tr.kind === "press") sayOnce("press", "Crushing presses. Watch the warning lights.");
      else sayOnce("trap", "Spike traps. Time your crossing.");
    }

    for (const e of S.enemies)
      if (!e.dead && e.type !== "reaper" && !tr.hitE.has(e) && Math.abs(e.x - tr.x) < 16 && Math.abs(e.y - tr.y) < 16) {
        tr.hitE.add(e); e.hp -= 2; e.hit = 0.1; if (e.hp <= 0) killEnemy(e);
      }
  }
}

function drowned(dt: number, flooded: boolean) {
  if (!flooded) return;
  S.shelfT -= dt;
  if (S.shelfT > 0) return;
  S.shelfT = 7;
  if (S.enemies.length >= 130) return;
  const px = Math.floor(S.p.x / T), py = Math.floor(S.p.y / T);
  const candidates: [number, number][] = [];
  for (let y = py - 7; y <= py + 7; y++) for (let x = px - 7; x <= px + 7; x++) {
    const distance = Math.hypot(x - px, y - py);
    if (distance < 4 || distance > 7 || solidAt(x, y)) continue;
    if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => S.grid[y + dy]?.[x + dx] === "#")) continue;
    candidates.push([x, y]);
  }
  if (!candidates.length) return;
  const [x, y] = candidates[Math.floor(Math.random() * candidates.length)];
  S.enemies.push({ type: "grunt", r: 10, hp: 2, speed: 78, x: (x + 0.5) * T, y: (y + 0.5) * T, cd: 0.5, side: 1, dead: false });
  S.booms.push({ x: (x + 0.5) * T, y: (y + 0.5) * T, t: 0.35 });
  sayOnce("drowned", "The drowned are emerging from the shelves.");
}

function conveyors(dt: number) {
  if (!S.conveyors.size) return;
  for (const body of [S.p, ...S.enemies]) {
    if ("dead" in body && body.dead) continue;
    const tx = Math.floor(body.x / T), ty = Math.floor(body.y / T);
    if (!S.conveyors.has(ty * S.cols + tx)) continue;
    const direction = (Math.floor(S.time / 4) + ty) % 2 ? -1 : 1;
    move(body, direction * 55 * dt, 0);
    if (body === S.p) sayOnce("conveyor", "Conveyors change direction. Keep moving.");
  }
}

function spores() {
  if (!S.spores.size) return;
  for (const body of [S.p, ...S.enemies]) {
    if ("dead" in body && body.dead) continue;
    const tx = Math.floor(body.x / T), ty = Math.floor(body.y / T), key = ty * S.cols + tx;
    if (!S.spores.delete(key)) continue;
    S.clouds.push({ x: tx * T + T / 2, y: ty * T + T / 2, t: 3, r: 32, seed: Math.random() * 9 });
    sayOnce("spores", "Spores burst when disturbed. Enemies spread them.");
  }
}

function astralBeam() {
  if (S.area.style !== "observatory") return;
  for (const key of S.hidden) {
    const x = key % S.cols, y = Math.floor(key / S.cols);
    if (!inAstralBeam((x + 0.5) * T, (y + 0.5) * T, S.mw, S.mh, S.time)) continue;
    S.grid[y][x] = ".";
    S.hidden.delete(key);
    sayOnce("astral", "The beam reveals hidden passages and quickens monsters.");
  }
}

/** Crypt: bone piles rise as a 1-hp grunt after 2.5s unless the player stomps them. */
function bones(dt: number) {
  const p = S.p;
  for (const b of S.bones) {
    b.t -= dt;
    if (Math.hypot(p.x - b.x, p.y - b.y) < p.r + 8) { b.dead = true; p.score += 5; pop(b.x, b.y, "stomped", C.ink); continue; }
    if (b.t > 0) continue;
    b.dead = true;
    const e = { type: "grunt" as const, r: 10, hp: 1, speed: 70, x: b.x, y: b.y, cd: 0.5, side: 1, dead: false, risen: true };
    if (!blocked(e)) { S.enemies.push(e); sayOnce("risen", "The dead get back up here. Stomp the bones."); }
  }
  S.bones = S.bones.filter((b) => !b.dead);
}
