import { C, T, reducedMotion } from "./constants";
import { pop, say, sayOnce } from "./narrator";
import { gainXp } from "./progression";
import { S } from "./state";
import type { Coffin, Enemy, EnemyType, Spawner } from "./types";
import { blocked, solidAt } from "./world";

/**
 * Damage the player. Monster damage is scaled by armor and shows the red edge glow;
 * `raw` damage (drain, poison, reapers) ignores armor and adds no glow by itself.
 */
export function hurt(n: number, raw = false) {
  const p = S.p;
  if (!raw && p.dashT > 0) return;
  if (!raw && p.guardT > 0) n *= 0.5;
  p.hp -= raw ? n : n * p.st.armor;
  if (raw) return;
  p.hurt = Math.min(1, p.hurt + n / 40);
  if (n >= 20) p.blink = 0.12;
}

const XP: Record<EnemyType, number> = { reaper: 15, lobber: 5, grunt: 3, biter: 1, boss: 80, archer: 6 };
const POINTS: Record<EnemyType, number> = { reaper: 250, lobber: 25, grunt: 10, biter: 5, boss: 1000, archer: 30 };

export function killEnemy(e: Enemy) {
  if (e.dead) return;
  e.dead = true;
  S.kills++;
  if (e.type === "boss") {
    S.bossDefeated = true;
    say("The champion falls. The area exit is open.");
  }
  // crypt: a third of grunts leave bones that rise again unless stomped
  if (e.type === "grunt" && S.area.style === "brick" && !e.risen && Math.random() < 0.35) S.bones.push({ x: e.x, y: e.y, t: 2.5 });
  gainXp(XP[e.type]);
  if (e.type === "reaper") pop(e.x, e.y, "+250", C.wisp);
  S.p.score += POINTS[e.type];
}

export function hitGen(g: Spawner, d: number) {
  if (!g.alive) return;
  g.hp -= d; g.hit = 0.12; S.p.score += 5;
  if (g.hp <= 0) {
    g.alive = false; S.p.score += 100; S.smashed++; gainXp(10);
    pop(g.x, g.y, "+100", C.torch);
    const left = S.gens.filter((x) => x.alive).length;
    say(left ? `Spawner down. ${left} to go.` : "Every spawner is silent.");
  }
}

/** Crypt coffins: food 40%, gold 30%, an angry grunt 30%. */
export function hitCoffin(c: Coffin, d: number) {
  c.hp -= d; c.hit = 0.12;
  if (c.hp > 0) return;
  c.alive = false; S.p.score += 20;
  const r = Math.random();
  if (r < 0.4) { S.pickups.push({ type: "F", x: c.x, y: c.y, alive: true }); say("Something edible in that coffin."); }
  else if (r < 0.7) S.pickups.push({ type: "$", x: c.x, y: c.y, alive: true });
  else { S.enemies.push({ type: "grunt", r: 10, hp: 2, speed: 80, x: c.x, y: c.y, cd: 0.6, side: 1, dead: false }); say("That coffin was occupied."); }
}

export const inView = (x: number, y: number) => {
  const c = S.cam;
  return !!c && x > c.x - T && x < c.x + c.w + T && y > c.y - T && y < c.y + c.h + T;
};

const SHOT_POTION_RADIUS = 150;
const POTION_RADIUS = SHOT_POTION_RADIUS * 2;

/** Potion: clears nearby enemies and hazards; only close spawners take damage. */
export function usePotion() {
  const p = S.p;
  if (p.potions <= 0) { say("No potions left."); return; }
  p.potions--;
  S.flash = reducedMotion() ? 0.2 : 0.45;
  const inRange = (x: number, y: number) => Math.hypot(x - p.x, y - p.y) < POTION_RADIUS;
  let n = 0, reaper = false, bossKilled = false, bossHit = false;
  for (const e of S.enemies) if (!e.dead && inRange(e.x, e.y)) {
    if (e.type === "reaper") reaper = true;
    if (e.type === "boss") {
      e.hp -= 25; e.hit = 0.12;
      if (e.hp <= 0) { killEnemy(e); bossKilled = true; }
      else bossHit = true;
    } else killEnemy(e);
    n++;
  }
  S.bombs = S.bombs.filter((b) => !inRange(b.tx, b.ty));
  S.balloons = S.balloons.filter((b) => !inRange(b.x, b.y));
  S.enemyShots = S.enemyShots.filter((s) => !inRange(s.x, s.y));
  S.clouds = S.clouds.filter((c) => !inRange(c.x, c.y));
  for (const g of S.gens) if (g.alive && Math.hypot(g.x - p.x, g.y - p.y) < SHOT_POTION_RADIUS) hitGen(g, 3);
  for (const c of S.coffins) if (c.alive && inRange(c.x, c.y)) hitCoffin(c, 3);
  S.bones = S.bones.filter((b) => !inRange(b.x, b.y));
  if (!bossKilled) say(bossHit ? "The champion staggers." : reaper ? "Death is undone." : n ? `The blast clears a path. ${n} down.` : "The blast fades.");
}

/** A shot potion on the floor goes off in a smaller radius. */
export function blast(x: number, y: number) {
  S.flash = reducedMotion() ? 0.12 : 0.25;
  for (const e of S.enemies) if (!e.dead && Math.hypot(e.x - x, e.y - y) < SHOT_POTION_RADIUS) {
    if (e.type === "boss") {
      e.hp -= 15; e.hit = 0.12;
      if (e.hp <= 0) killEnemy(e);
    } else killEnemy(e);
  }
}

/** Spawn from a spawner onto a free neighbouring tile. Horde spawners send a biter pack every third spawn. */
export function spawnFrom(g: Spawner) {
  const opts: [number, number][] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    if (!solidAt(g.tx + dx, g.ty + dy)) opts.push([g.tx + dx, g.ty + dy]);
  }
  if (!opts.length) return;
  const [tx, ty] = opts[(Math.random() * opts.length) | 0];
  let list: EnemyType[];
  if (g.kind === "lobber") {
    if (S.enemies.filter((e) => e.den === g).length >= 3) return;
    list = ["lobber"];
  } else list = g.n++ % 3 === 2 ? (S.area.style === "desert" ? ["archer"] : ["biter", "biter", "biter"]) : ["grunt"];
  for (const type of list) {
    const base = type === "lobber" ? { r: 11, hp: 2, speed: 48, throwCd: 1 + Math.random() }
      : type === "archer" ? { r: 10, hp: 3, speed: 65, throwCd: 1 + Math.random() }
      : type === "biter" ? { r: 6, hp: 1, speed: 150 }
      : { r: 10, hp: g.tier, speed: 62 + g.tier * 8 };
    const e: Enemy = {
      type, ...base,
      x: tx * T + T / 2 + (Math.random() - 0.5) * 10, y: ty * T + T / 2 + (Math.random() - 0.5) * 10,
      cd: 0, side: Math.random() < 0.5 ? 1 : -1, dead: false, den: g,
    };
    if (blocked(e)) continue;
    S.enemies.push(e);
    if (type === "biter") sayOnce("biter", "Ankle biters. Small, fast, and hungry.");
    if (type === "lobber") sayOnce("lobber", "Something is throwing from behind the walls.");
    if (type === "archer") sayOnce("archer", "Desert archers fire across quicksand. Keep moving.");
  }
}
