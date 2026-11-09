import { GATES } from "../gen/generator";
import { T } from "./constants";
import { say, sayOnce } from "./narrator";
import { S } from "./state";
import type { Vec } from "./types";

type Body = Vec & { r: number };

/** Walls, locked doors, closed gates, live spawners and intact coffins block movement and shots. */
export function solidAt(tx: number, ty: number, projectile = false): boolean {
  if (tx < 0 || ty < 0 || tx >= S.cols || ty >= S.rows) return true;
  const c = S.grid[ty][tx];
  if (c === "#" || c === "H" || c === "D" || (c === "Q" && !projectile) || GATES.includes(c)) return true;
  const k = ty * S.cols + tx;
  const g = S.genAt.get(k);
  if (g && g.alive) return true;
  const cf = S.coffinAt.get(k);
  return !!(cf && cf.alive);
}

/** Visit every tile a circle's bounding box touches; stops early when fn returns true. */
export function eachTile(e: Body, fn: (tx: number, ty: number) => boolean): boolean {
  const x0 = Math.floor((e.x - e.r) / T), x1 = Math.floor((e.x + e.r - 0.01) / T);
  const y0 = Math.floor((e.y - e.r) / T), y1 = Math.floor((e.y + e.r - 0.01) / T);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (fn(tx, ty)) return true;
  return false;
}

export const blocked = (e: Body) => eachTile(e, solidAt);

/** Move if the destination is clear. Returns false (and doesn't move) when blocked. */
export function move(e: Body, dx: number, dy: number): boolean {
  e.x += dx; e.y += dy;
  if (blocked(e)) { e.x -= dx; e.y -= dy; return false; }
  return true;
}

/** Player movement also handles bumping into locked doors (spend a key) and gates (hint). */
export function movePlayer(dx: number, dy: number) {
  const p = S.p;
  if (move(p, dx, dy)) return;
  p.x += dx; p.y += dy;
  let door: [number, number] | null = null, gate = false, quicksand = false;
  eachTile(p, (tx, ty) => {
    const c = S.grid[ty]?.[tx];
    if (c === "D") { door = [tx, ty]; return true; }
    if (c && GATES.includes(c)) gate = true;
    if (c === "Q") quicksand = true;
    return false;
  });
  p.x -= dx; p.y -= dy;
  const d = door as [number, number] | null;
  if (!d) {
    if (quicksand) sayOnce("quicksand", "Quicksand blocks your path, but shots can cross it.");
    if (gate && S.time > S.lockSay) { S.lockSay = S.time + 3; say("Sealed. Find the lever that matches its color."); }
    return;
  }
  if (p.keys > 0) { p.keys--; openDoor(d[0], d[1]); say("Door unlocked."); }
  else if (S.time > S.lockSay) { S.lockSay = S.time + 3; say("Locked. Find a key."); }
}

/** Open a whole doorway (8-connected door tiles) with one key. */
export function openDoor(x: number, y: number) {
  const st: [number, number][] = [[x, y]];
  while (st.length) {
    const [a, b] = st.pop()!;
    if (S.grid[b]?.[a] !== "D") continue;
    S.grid[b][a] = ".";
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) st.push([a + i, b + j]);
  }
}

export const tileAt = (x: number, y: number): [number, number] => [Math.floor(x / T), Math.floor(y / T)];
