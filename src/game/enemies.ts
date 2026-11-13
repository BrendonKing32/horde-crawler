import { BALLOONS, T } from "./constants";
import { hurt } from "./actions";
import { mobDamage } from "./difficulty";
import { say, sayOnce } from "./narrator";
import { S } from "./state";
import type { Enemy } from "./types";
import { move, solidAt } from "./world";
import { highTide, inAstralBeam } from "./area-mechanics";

/** Per-enemy context computed once per frame. */
interface Ctx { dt: number; dx: number; dy: number; d: number; ux: number; uy: number; sp: number }

export function updateEnemies(dt: number) {
  const p = S.p;
  for (const e of S.enemies) {
    if (e.dead) continue;
    e.cd -= dt;
    e.hit = Math.max(0, (e.hit || 0) - dt);
    const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
    if (d > 16 * T) continue; // dormant when far away
    const empowered = S.area.style === "observatory" && inAstralBeam(e.x, e.y, S.mw, S.mh, S.time);
    const drowned = S.area.style === "archive" && e.type === "grunt" && highTide(S.time);
    const c: Ctx = { dt, dx, dy, d, ux: dx / d, uy: dy / d, sp: e.speed * dt * (empowered ? 1.5 : drowned ? 1.25 : 1) };
    if (S.area.style === "hollow" && e.type !== "reaper" && e.type !== "boss") {
      e.sporeCd = (e.sporeCd ?? 3) - dt;
      if (e.sporeCd <= 0) {
        e.sporeCd = 5;
        const tx = Math.floor(e.x / T), ty = Math.floor(e.y / T);
        const neighbours = [[1, 0], [0, 1], [-1, 0], [0, -1]];
        const spot = neighbours.find(([dx, dy]) =>
          S.grid[ty + dy]?.[tx + dx] === "." &&
          !solidAt(tx + dx, ty + dy) &&
          Math.hypot(S.p.x - (tx + dx + 0.5) * T, S.p.y - (ty + dy + 0.5) * T) >= T);
        if (spot) S.spores.add((ty + spot[1]) * S.cols + tx + spot[0]);
      }
    }
    if (e.type === "boss") boss(e, c);
    else if (e.type === "reaper") reaper(e, c);
    else if (e.type === "lobber") lobber(e, c);
    else if (e.type === "archer") archer(e, c);
    else if (e.type === "biter") biter(e, c);
    else grunt(e, c);
  }
  separate();
}

function archer(e: Enemy, c: Ctx) {
  const steps = Math.ceil(c.d / (T / 2));
  let clear = true;
  for (let i = 1; i < steps; i++) {
    const x = e.x + c.dx * i / steps, y = e.y + c.dy * i / steps;
    if (solidAt(Math.floor(x / T), Math.floor(y / T), true)) { clear = false; break; }
  }
  if (!clear || c.d > 11 * T) chaseStep(e, c);
  else if (c.d < 3 * T) {
    move(e, -c.ux * c.sp, 0);
    move(e, 0, -c.uy * c.sp);
  }
  e.throwCd = (e.throwCd ?? 1) - c.dt;
  e.wind = Math.max(0, (e.wind || 0) - c.dt);
  if (clear && c.d < 12 * T && e.throwCd <= 0) {
    e.throwCd = 2;
    e.wind = 0.25;
    S.enemyShots.push({ x: e.x + c.ux * (e.r + 4), y: e.y + c.uy * (e.r + 4), vx: c.ux * 260, vy: c.uy * 260, life: 1.6 });
  }
}

function boss(e: Enemy, c: Ctx) {
  e.chargeCd = (e.chargeCd ?? 2) - c.dt;
  if (e.chargeWind !== undefined) {
    e.chargeWind -= c.dt;
    e.wind = Math.max(0, e.chargeWind);
    if (e.chargeWind <= 0) { e.chargeWind = undefined; e.chargeT = 0.55; }
  } else if ((e.chargeT || 0) > 0) {
    move(e, (e.chargeX || 0) * 220 * c.dt, 0);
    move(e, 0, (e.chargeY || 0) * 220 * c.dt);
    e.chargeT = (e.chargeT || 0) - c.dt;
    if (e.chargeT <= 0) e.chargeCd = 3;
  } else if (e.chargeCd <= 0) {
    e.chargeWind = 0.7;
    e.chargeX = c.ux;
    e.chargeY = c.uy;
    sayOnce("boss", "The champion winds up a charge. Get clear.");
  } else {
    chaseStep(e, { ...c, sp: c.sp * 0.8 });
  }
  const d = Math.hypot(S.p.x - e.x, S.p.y - e.y);
  if (d < e.r + S.p.r + 1 && e.cd <= 0) { hurt(mobDamage(12, S.depth)); e.cd = 0.75; }
}

const touching = (e: Enemy, c: Ctx) => c.d < e.r + S.p.r + 1;

function chaseStep(e: Enemy, c: Ctx) {
  const a = move(e, c.ux * c.sp, 0), b = move(e, 0, c.uy * c.sp);
  if (!a && !b) move(e, -c.uy * c.sp * e.side, c.ux * c.sp * e.side); // slide along walls
}

function grunt(e: Enemy, c: Ctx) {
  chaseStep(e, c);
  if (touching(e, c) && e.cd <= 0) { hurt(mobDamage(8, S.depth)); e.cd = 0.6; }
}

/** Immune to shots; drains depth-scaled raw health 4x/sec, vanishes after feeding 180. Catacombs: drifts through walls. */
function reaper(e: Enemy, c: Ctx) {
  const p = S.p;
  e.ping = Math.max(0, (e.ping || 0) - c.dt);
  if (!e.awake) {
    if (c.d >= 8 * T) return;
    e.awake = true;
    sayOnce("reaper", S.area.style === "bone" ? "Death walks through walls here. Only a potion will stop it." : "Death is awake. Only a potion will stop it.");
  }
  if (S.area.style === "bone") {
    e.x = Math.max(T, Math.min(S.mw - T, e.x + c.ux * c.sp * 0.85));
    e.y = Math.max(T, Math.min(S.mh - T, e.y + c.uy * c.sp * 0.85));
    e.inWall = solidAt(Math.floor(e.x / T), Math.floor(e.y / T));
  } else chaseStep(e, c);
  if (touching(e, c) && e.cd <= 0) {
    const damage = mobDamage(15, S.depth);
    hurt(damage, true);
    p.hurt = Math.min(1, p.hurt + 0.25);
    e.cd = 0.25;
    e.fed = (e.fed || 0) + damage;
    if (e.fed >= 180) { e.dead = true; S.booms.push({ x: e.x, y: e.y, t: 0.35 }); say("Death has had its fill. For now."); }
  }
}

/** Keeps 4-6 tiles away and throws over walls: bombs normally, homing balloons at the carnival. */
function lobber(e: Enemy, c: Ctx) {
  const p = S.p;
  let mx: number, my: number;
  if (c.d > 6 * T) { mx = c.ux; my = c.uy; }
  else if (c.d < 4 * T) { mx = -c.ux; my = -c.uy; }
  else { mx = -c.uy * e.side * 0.6; my = c.ux * e.side * 0.6; }
  if (!move(e, mx * c.sp, 0)) e.side *= -1;
  move(e, 0, my * c.sp);
  e.throwCd = (e.throwCd ?? 1) - c.dt;
  e.wind = Math.max(0, (e.wind || 0) - c.dt);
  if (e.throwCd <= 0 && c.d < 9 * T) {
    e.throwCd = 2.2 + Math.random() * 1.2;
    e.wind = 0.25;
    if (S.area.carnival) {
      S.balloons.push({ x: e.x, y: e.y - 4, vx: c.ux * 30, vy: c.uy * 30, t: 7, c: BALLOONS[(Math.random() * 4) | 0] });
      sayOnce("balloon", "Balloons. Pop them before they reach you.");
    } else S.bombs.push({ sx: e.x, sy: e.y, tx: p.x + (Math.random() - 0.5) * 30, ty: p.y + (Math.random() - 0.5) * 30, t: 0, dur: 1.15 });
  }
}

function biter(e: Enemy, c: Ctx) {
  if (S.area.carnival) return windUp(e, c);
  if (S.area.style === "rock") burrow(e, c);
  wanderChase(e, c);
}

/** Carnival: march in straight lines, bounce off walls, re-aim every couple of seconds. */
function windUp(e: Enemy, c: Ctx) {
  e.mt = (e.mt ?? Math.random() * 2) - c.dt;
  if (e.hd === undefined) e.hd = Math.random() * 6.283;
  if (e.mt <= 0) { e.mt = 2 + Math.random() * 1.5; e.hd = Math.atan2(c.dy, c.dx) + (Math.random() - 0.5) * 0.5; }
  const bs = c.sp * 0.8;
  if (!move(e, Math.cos(e.hd) * bs, 0)) e.hd = Math.PI - e.hd;
  if (!move(e, 0, Math.sin(e.hd) * bs)) e.hd = -e.hd;
  if (touching(e, c) && e.cd <= 0) { hurt(mobDamage(3, S.depth)); e.cd = 0.3; e.hd += Math.PI; }
  sayOnce("windup", "Wind-up toys. They march straight and bounce.");
}

/** Caverns: dig under the floor (can't be shot or bite), then pop up near the player. */
function burrow(e: Enemy, c: Ctx) {
  e.bt = (e.bt ?? 1 + Math.random() * 3) - c.dt;
  if (!e.under && e.bt <= 0 && c.d > 3 * T) {
    e.under = true; e.bt = 1.5 + Math.random() * 1.5; e.mode = "chase"; e.mt = e.bt;
    sayOnce("burrow", "Something is tunneling under the floor.");
  } else if (e.under && (e.bt <= 0 || c.d < 1.2 * T)) {
    e.under = false; e.bt = 2 + Math.random() * 3;
    S.booms.push({ x: e.x, y: e.y, t: 0.25 });
    e.mode = "chase"; e.mt = 0.8;
  }
}

/** Default biter mood cycle: wander -> notice and chase in a weaving rush -> scatter -> wander. */
function wanderChase(e: Enemy, c: Ctx) {
  const { dx, dy, d, dt } = c;
  e.mt = (e.mt ?? 0) - dt;
  if (e.mode === undefined) { e.mode = "wander"; e.hd = Math.random() * 6.283; }
  let hd = e.hd ?? 0;
  if (e.mode === "wander") {
    if (e.mt <= 0) {
      e.mt = 0.3 + Math.random() * 0.8;
      hd = d > 9 * T && Math.random() < 0.5 ? Math.atan2(dy, dx) + (Math.random() - 0.5) * 1.6 : Math.random() * 6.283;
    }
    hd += (Math.random() - 0.5) * 4 * dt;
    if (d < 5 * T && Math.random() < dt * 1.2) { e.mode = "chase"; e.mt = 1 + Math.random() * 1.5; }
  } else if (e.mode === "chase") {
    hd = Math.atan2(dy, dx) + Math.sin(S.time * 9 + e.x * 0.1) * 0.5;
    if (e.mt <= 0) { e.mode = "scatter"; e.mt = 0.4 + Math.random() * 0.6; hd = Math.atan2(-dy, -dx) + (Math.random() - 0.5) * 1.5; }
  } else if (e.mt <= 0) { e.mode = "wander"; e.mt = 0; }
  const bs = c.sp * (e.mode === "wander" ? 0.55 : 1) * (e.under ? 1.25 : 1);
  const okx = move(e, Math.cos(hd) * bs, 0), oky = move(e, 0, Math.sin(hd) * bs);
  if (!okx || !oky) hd += Math.PI * (0.5 + Math.random());
  e.hd = hd;
  if (!e.under && touching(e, c) && e.cd <= 0) {
    hurt(mobDamage(3, S.depth)); e.cd = 0.3;
    if (Math.random() < 0.35) { e.mode = "scatter"; e.mt = 0.5 + Math.random() * 0.5; e.hd = Math.atan2(-dy, -dx) + (Math.random() - 0.5) * 1.2; }
  }
}

/** Push overlapping enemies apart and drop the dead. */
function separate() {
  const live = S.enemies.filter((e) => !e.dead);
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
    const A = live[i], B = live[j];
    const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy), m = A.r + B.r - 2;
    if (d > 0 && d < m) { const k = (m - d) / 2 / d; move(A, -dx * k, -dy * k); move(B, dx * k, dy * k); }
  }
  S.enemies = live;
}
