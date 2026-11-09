import { LEVERS, areaOf, buildFloor } from "../gen/generator";
import { AREAS, CLASSES, T, type ClassId } from "./constants";
import type { Carry, Coffin, Lever, Pickup, PickupType, Spawner, Trap, Vec, World } from "./types";

/** The live floor. Reassigned by newFloor(); other modules read it through this live binding. */
export let S: World;

/** Choices made on the start screen. */
export const settings = {
  cls: "warden" as ClassId,
  /** Testing: which floor a fresh run starts on. */
  startDepth: 1,
  runSeed: 0,
};

/** Build a floor. Without `carry` this starts a fresh run with a new seed. */
export function newFloor(carry?: Carry): World {
  const depth = carry ? carry.depth : settings.startDepth;
  if (!carry) settings.runSeed = (Math.random() * 2 ** 31) >>> 0;
  const map = buildFloor((settings.runSeed + depth * 7919) >>> 0, depth);
  const rows = map.length, cols = map[0].length;
  const key = (x: number, y: number) => y * cols + x;

  const tentWall = new Set<number>(), tentFloor = new Set<number>();
  for (const [x0, y0, w, h] of map.tents ?? [])
    for (let y = y0 - 1; y <= y0 + h; y++) for (let x = x0 - 1; x <= x0 + w; x++)
      (x < x0 || x >= x0 + w || y < y0 || y >= y0 + h ? tentWall : tentFloor).add(key(x, y));

  const grid: string[][] = [], gens: Spawner[] = [], pickups: Pickup[] = [], reapers: Vec[] = [];
  const levers: Lever[] = [], coffins: Coffin[] = [], traps: Trap[] = [], pools = new Set<number>();
  let start: Vec = { x: 48, y: 48 }, exit: Vec | null = null;
  for (let y = 0; y < rows; y++) {
    const row: string[] = [], src = (map[y] || "").padEnd(cols, ".");
    for (let x = 0; x < cols; x++) {
      let c = src[x];
      if (x === 0 || y === 0 || x === cols - 1 || y === rows - 1) c = "#";
      const cx = x * T + T / 2, cy = y * T + T / 2;
      if (c === "P") { start = { x: cx, y: cy }; c = "."; }
      else if (c === "G" || c === "L") {
        const den = c === "L", tier = den ? 2 : 1 + ((x * 7 + y * 3) % 3);
        gens.push({ tx: x, ty: y, x: cx, y: cy, kind: den ? "lobber" : "horde", tier, hp: tier * 3, max: tier * 3, t: 0.5 + Math.random() * 2, alive: true, hit: 0, n: 0 });
        c = ".";
      }
      else if (LEVERS.includes(c)) { levers.push({ id: LEVERS.indexOf(c), x: cx, y: cy, on: false }); c = "."; }
      else if (c === "S") { coffins.push({ tx: x, ty: y, x: cx, y: cy, hp: 3, alive: true, hit: 0 }); c = "."; }
      else if (c === "^") { traps.push({ tx: x, ty: y, x: cx, y: cy, hitE: new Set() }); c = "."; }
      else if (c === "~") { pools.add(key(x, y)); c = "."; }
      else if ("FOK$".includes(c)) { pickups.push({ type: c as PickupType, x: cx, y: cy, alive: true }); c = "."; }
      else if (c === "X") { exit = { x: cx, y: cy }; c = "."; }
      else if (c === "R") { reapers.push({ x: cx, y: cy }); c = "."; }
      row.push(c);
    }
    grid.push(row);
  }

  // connected spike strips share one random phase so a strip rises together
  const tk = new Map(traps.map((t) => [key(t.tx, t.ty), t]));
  for (const t of traps) {
    if (t.ph !== undefined) continue;
    const ph = Math.random(), st = [t];
    t.ph = ph;
    while (st.length) {
      const a = st.pop()!;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const n = tk.get(key(a.tx + dx, a.ty + dy));
        if (n && n.ph === undefined) { n.ph = ph; st.push(n); }
      }
    }
  }

  const cls = CLASSES[settings.cls];
  S = {
    depth, area: AREAS[areaOf(depth)], cols, rows, mw: cols * T, mh: rows * T, grid,
    p: {
      x: start.x, y: start.y, r: 11,
      hp: carry ? carry.hp : cls.hp, maxHp: cls.hp, cls,
      st: carry ? carry.st : { ...cls, food: 100, drain: 1, split: 0, pierce: 0 },
      face: { x: 1, y: 0 }, cd: 0, keys: 0,
      potions: carry ? carry.potions : 1, score: carry ? carry.score : 0,
      level: carry ? carry.level : 1, xp: carry ? carry.xp : 0, ups: carry ? carry.ups : {},
      hurt: 0, blink: 0, slowF: 1, cloudT: 0, poolT: 0,
      abilityCd: 0, guardT: 0, dashT: 0,
    },
    enemies: reapers.map((r) => ({ type: "reaper" as const, r: 12, hp: Infinity, speed: 72, x: r.x, y: r.y, cd: 0, side: 1, dead: false, fed: 0, awake: false })),
    gens, genAt: new Map(gens.map((g) => [key(g.tx, g.ty), g])),
    pickups, levers, coffins, coffinAt: new Map(coffins.map((k) => [key(k.tx, k.ty), k])),
    traps, pools, tentWall, tentFloor, exit,
    shots: [], bombs: [], balloons: [], clouds: [], rocks: [], bones: [], pops: [], booms: [], opening: [],
    cam: null, state: "ready",
    time: carry ? carry.time : 0, drain: 0, flash: 0,
    kills: carry ? carry.kills : 0, smashed: carry ? carry.smashed : 0, pending: carry ? carry.pending : 0,
    said: {}, lockSay: 0, reaperTip: 0, rockT: 4, lightsT: 10, dark: false, flick: false,
    bossFloor: depth % 5 === 0, bossDefeated: false,
  };
  if (S.bossFloor && exit) {
    const tx = Math.floor(exit.x / T), ty = Math.floor(exit.y / T);
    const candidates: [number, number][] = [];
    for (let radius = 1; radius <= 3; radius++)
      for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++)
        if (Math.max(Math.abs(dx), Math.abs(dy)) === radius) candidates.push([tx + dx, ty + dy]);
    const [bx, by] = candidates.find(([x, y]) =>
      grid[y]?.[x] === "." &&
      [-1, 0, 1].every((dy) => [-1, 0, 1].every((dx) =>
        grid[y + dy]?.[x + dx] === "." &&
        !gens.some((g) => g.tx === x + dx && g.ty === y + dy) &&
        !coffins.some((c) => c.tx === x + dx && c.ty === y + dy) &&
        !traps.some((t) => t.tx === x + dx && t.ty === y + dy) &&
        !pools.has((y + dy) * cols + x + dx),
      )) &&
      !pickups.some((k) => Math.floor(k.x / T) === x && Math.floor(k.y / T) === y),
    ) ?? [tx, ty];
    const hp = 90 + Math.floor(depth / 5) * 20;
    S.enemies.push({
      type: "boss", r: 17, hp, maxHp: hp, speed: 58, x: bx * T + T / 2, y: by * T + T / 2,
      cd: 0, side: 1, dead: false, chargeCd: 2.2,
    });
  }
  return S;
}
