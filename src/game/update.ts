import { GATES } from "../gen/generator";
import { C, PAIR, T } from "./constants";
import { blast, hitCoffin, hitGen, hurt, killEnemy, spawnFrom, usePotion } from "./actions";
import { updateEnemies } from "./enemies";
import { bossClear, nextFloor, endRun } from "./flow";
import { updateHazards } from "./hazards";
import { input } from "./input";
import { pop, say, sayOnce, tickNarrator } from "./narrator";
import { openLevelUp } from "./progression";
import { S } from "./state";
import { move, movePlayer, solidAt } from "./world";

/** Advance the game by dt seconds. Only called while S.state === "play". */
export function update(dt: number) {
  if (S.pending > 0) { openLevelUp(); return; }
  const p = S.p;
  S.time += dt;

  // health is the clock: 1/sec, ignores armor (Slow burn upgrade lowers it)
  S.drain += dt * p.st.drain;
  while (S.drain >= 1) { S.drain -= 1; hurt(1, true); }

  updatePlayer(dt);
  updateShots(dt);
  for (const c of S.coffins) c.hit = Math.max(0, c.hit - dt);
  updateSpawners(dt);
  updateEnemies(dt);
  updateHazards(dt);
  updateLeversAndPickups();
  healthWarnings();
  updateEffects(dt);

  if (S.exit && Math.hypot(S.exit.x - p.x, S.exit.y - p.y) < 18) {
    if (S.bossFloor) {
      if (S.bossDefeated) { bossClear(); return; }
    } else { nextFloor(); return; }
  }
  if (p.hp <= 0) { p.hp = 0; endRun(false); }
}

function updatePlayer(dt: number) {
  const p = S.p, k = input.keys;
  let ix = 0, iy = 0;
  if (k.has("d") || k.has("arrowright")) ix++;
  if (k.has("a") || k.has("arrowleft")) ix--;
  if (k.has("s") || k.has("arrowdown")) iy++;
  if (k.has("w") || k.has("arrowup")) iy--;
  if (input.joy) { ix += (input.joy.x - input.joy.ox) / 50; iy += (input.joy.y - input.joy.oy) / 50; }
  const touchAiming = !!input.aimJoy && Math.hypot(input.aimJoy.x - input.aimJoy.ox, input.aimJoy.y - input.aimJoy.oy) > 12;
  const L = Math.hypot(ix, iy);
  if (L > 0.25) {
    const n = Math.min(L, 1);
    ix /= L; iy /= L;
    if (!input.aim && !touchAiming) p.face = { x: ix, y: iy };
    const sp = p.st.speed * p.slowF * n * dt;
    movePlayer(ix * sp, 0);
    movePlayer(0, iy * sp);
  }
  input.aimDirection = null;
  if (input.aimJoy) {
    const ax = input.aimJoy.x - input.aimJoy.ox, ay = input.aimJoy.y - input.aimJoy.oy, m = Math.hypot(ax, ay);
    if (m > 12) input.aimDirection = { x: ax / m, y: ay / m };
  }
  if (input.aimDirection) p.face = input.aimDirection;
  else if (input.aim) {
    const ax = input.aim.x - p.x, ay = input.aim.y - p.y, m = Math.hypot(ax, ay);
    if (m > 1) p.face = { x: ax / m, y: ay / m };
  }
  p.abilityCd = Math.max(0, p.abilityCd - dt);
  p.guardT = Math.max(0, p.guardT - dt);
  p.dashT = Math.max(0, p.dashT - dt);
  if (input.abilityReq) {
    input.abilityReq = false;
    if (p.abilityCd <= 0) {
      p.abilityCd = p.cls.color === "torch" ? 7 : 5;
      if (p.cls.color === "torch") {
        p.guardT = 1.8;
        say("Bulwark. Monster hits are halved.");
      } else {
        for (let step = 0; step < 8; step++)
          if (!move(p, p.face.x * 14, p.face.y * 14)) break;
        p.dashT = 0.45;
        S.booms.push({ x: p.x, y: p.y, t: 0.25 });
        say("Quickstep. You dodge monster hits briefly.");
      }
    }
  }
  p.cd -= dt;
  const firing = k.has(" ") || k.has("j") || input.fireTouch || input.fireMouse;
  if (firing && p.cd <= 0) {
    const s = p.st;
    p.cd = s.cd;
    const base = Math.atan2(p.face.y, p.face.x);
    for (let i = -s.split; i <= s.split; i++) {
      const a = base + i * 0.16, cx = Math.cos(a), cy = Math.sin(a);
      S.shots.push({ x: p.x + cx * 13, y: p.y + cy * 13, vx: cx * s.shotSpeed, vy: cy * s.shotSpeed, life: s.life, dmg: s.dmg, pierce: s.pierce, hits: new Set() });
    }
  }
  if (input.potionReq) { input.potionReq = false; usePotion(); }
  p.hurt = Math.max(0, p.hurt - dt * 1.5);
  p.blink = Math.max(0, p.blink - dt);
}

function updateShots(dt: number) {
  for (const s of S.shots) {
    s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
    if (s.life <= 0) { s.dead = true; continue; }
    const tx = Math.floor(s.x / T), ty = Math.floor(s.y / T);
    if (solidAt(tx, ty, true)) {
      const key = ty * S.cols + tx;
      const g = S.genAt.get(key); if (g && g.alive) hitGen(g, s.dmg);
      const cf = S.coffinAt.get(key); if (cf && cf.alive) hitCoffin(cf, s.dmg);
      s.dead = true;
      continue;
    }
    // friendly fire on pickups: food is destroyed, potions go off
    for (const k of S.pickups) {
      if (!k.alive || (k.type !== "F" && k.type !== "O")) continue;
      if (Math.hypot(k.x - s.x, k.y - s.y) >= 12) continue;
      k.alive = false; s.dead = true;
      if (k.type === "F") { say("You shot the food. Bold."); pop(k.x, k.y, "food lost", C.blood); }
      else { blast(k.x, k.y); say("Shot a potion. It went off anyway."); }
      break;
    }
    if (s.dead) continue;
    for (const b of S.balloons)
      if (!b.dead && Math.hypot(b.x - s.x, b.y - s.y) < 11) { b.dead = true; s.dead = true; S.p.score += 2; S.booms.push({ x: b.x, y: b.y, t: 0.2 }); break; }
    if (s.dead) continue;
    for (const e of S.enemies) {
      if (e.dead || Math.hypot(e.x - s.x, e.y - s.y) >= e.r + 3) continue;
      if (e.under) continue;
      if (e.type === "reaper") {
        e.ping = 0.2; s.dead = true;
        if (S.time > S.reaperTip) { S.reaperTip = S.time + 6; say("Shots won't touch it. Use a potion."); }
        break;
      }
      if (s.hits.has(e)) continue;
      s.hits.add(e);
      e.hp -= s.dmg; e.hit = 0.08;
      if (s.pierce > 0) s.pierce--; else s.dead = true;
      if (e.hp <= 0) killEnemy(e);
      if (s.dead) break;
    }
  }
  S.shots = S.shots.filter((s) => !s.dead);
}

/** Spawners only work while the player is within 11 tiles; tier sets the pace. */
function updateSpawners(dt: number) {
  const p = S.p;
  for (const g of S.gens) {
    if (!g.alive) continue;
    g.hit = Math.max(0, g.hit - dt);
    g.t -= dt;
    if (g.t > 0) continue;
    g.t = (2.8 - g.tier * 0.5) * (0.7 + Math.random() * 0.6) * (S.area.style === "desert" ? 0.45 : 1);
    if (Math.hypot(g.x - p.x, g.y - p.y) < 11 * T && S.enemies.length < 130) spawnFrom(g);
  }
}

function updateLeversAndPickups() {
  const p = S.p;
  for (const l of S.levers) {
    if (l.on || Math.hypot(l.x - p.x, l.y - p.y) > p.r + 12) continue;
    l.on = true;
    const ch = GATES[l.id];
    for (let ty = 0; ty < S.rows; ty++) for (let tx = 0; tx < S.cols; tx++)
      if (S.grid[ty][tx] === ch) { S.grid[ty][tx] = "."; S.opening.push({ tx, ty, id: l.id, t: 0.6 }); }
    pop(l.x, l.y - 12, "clunk", PAIR[l.id]);
    say("A gate grinds open somewhere.");
  }
  for (const k of S.pickups) {
    if (!k.alive || Math.hypot(k.x - p.x, k.y - p.y) > p.r + 10) continue;
    k.alive = false;
    if (k.type === "F") { p.hp = Math.min(999, p.hp + p.st.food); pop(k.x, k.y, `+${p.st.food}`, C.life); say("Food. Eat while you can."); }
    else if (k.type === "O") { p.potions = Math.min(9, p.potions + 1); pop(k.x, k.y, "potion", C.mana); }
    else if (k.type === "K") { p.keys++; pop(k.x, k.y, "key", C.gold); say("Key found. Something is locked nearby."); }
    else { p.score += 100; pop(k.x, k.y, "+100", C.gold); }
  }
}

function healthWarnings() {
  const hp = S.p.hp;
  if (hp <= 300) sayOnce("low", "Health is fading. Find food.");
  if (hp <= 120) sayOnce("crit", "Almost out. Every second counts.");
  if (hp > 360) { S.said.low = false; S.said.crit = false; }
}

function updateEffects(dt: number) {
  for (const q of S.pops) { q.t -= dt; q.y -= 22 * dt; }
  S.pops = S.pops.filter((q) => q.t > 0);
  for (const q of S.booms) q.t -= dt;
  S.booms = S.booms.filter((q) => q.t > 0);
  for (const o of S.opening) o.t -= dt;
  S.opening = S.opening.filter((o) => o.t > 0);
  S.flash = Math.max(0, S.flash - dt * 1.6);
  tickNarrator(dt);
}
