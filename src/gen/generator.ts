/**
 * Floor generator. Produces a 44x32 character map:
 *
 *   #  wall            .  floor           P  player start     X  exit
 *   D  locked door     K  key             G  horde spawner    L  lobber den
 *   R  reaper          F  food            O  potion           $  treasure
 *   a b c  gates       x y z  their levers (gate "a" opens with lever "x", etc.)
 *   S  coffin (crypt)  ^  spike trap (catacombs)  ~  bile pool (plague ward)
 *
 * Guarantees (enforced here, verified by tests/generator.test.ts):
 * - the exit sits in a locked vault whose key is reachable without passing that vault
 * - every gate's lever is in the region before that gate
 * - every region has food; every reaper has a potion at or before its own region
 */
import { makeRand } from "./rng";
import { H, W, caverns, catacombs, crypt, fairgrounds, makeKit, plagueWard, type Pt, type Room } from "./layouts";

export const GATES = "abc";
export const LEVERS = "xyz";

/** Area ids, in the order they appear every five floors. */
export const AREA = { CRYPT: 0, CAVERNS: 1, CATACOMBS: 2, PLAGUE: 3, CARNIVAL: 4 } as const;
export type AreaId = (typeof AREA)[keyof typeof AREA];
export const AREA_COUNT = 5;

/** Floors 1-5 crypt, 6-10 caverns, 11-15 catacombs, 16-20 plague ward, 21-25 carnival, then repeat. */
export const areaOf = (depth: number): AreaId => (Math.floor((depth - 1) / 5) % AREA_COUNT) as AreaId;

export type Tent = [x: number, y: number, w: number, h: number];
export type FloorMap = string[] & { tents?: Tent[] };

const N4: Pt[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
type Dist = number[][];

/** Build a floor for this seed and depth, retrying with derived seeds until one passes every check. */
export function buildFloor(seed: number, depth: number): FloorMap {
  for (let k = 0; k < 150; k++) {
    const m = generate(seed + k * 101, depth, areaOf(depth));
    if (m) return m;
  }
  throw new Error(`floor generation failed (seed ${seed}, depth ${depth})`);
}

/** One generation attempt. Returns null when the layout can't satisfy the guarantees. */
export function generate(seed: number, depth: number, area: AreaId = AREA.CRYPT): FloorMap | null {
  const rand = makeRand(seed);
  const kit = makeKit(rand);
  const { g } = kit;
  const layout = [crypt, caverns, catacombs, plagueWard, fairgrounds][area];
  const rooms = layout(kit);
  if (!rooms || rooms.length < 6) return null;

  const inRoom = (x: number, y: number) => rooms.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
  const start = rooms[0];

  /** BFS distance from start. Walls, doors and temporary cuts block; gates block unless their letter is open. */
  const reach = (open = ""): Dist => {
    const D: Dist = Array.from({ length: H }, () => Array<number>(W).fill(-1));
    const q: Pt[] = [[start.cx, start.cy]];
    D[start.cy][start.cx] = 0;
    for (let i = 0; i < q.length; i++) {
      const [x, y] = q[i];
      for (const [dx, dy] of N4) {
        const X = x + dx, Y = y + dy, c = g[Y][X];
        if (c === "#" || c === "D" || c === "=" || (GATES.includes(c) && !open.includes(c)) || D[Y][X] >= 0) continue;
        D[Y][X] = D[y][x] + 1;
        q.push([X, Y]);
      }
    }
    return D;
  };
  /** Floor tiles on the ring just outside a room. */
  const openings = (r: Room): Pt[] => {
    const o: Pt[] = [];
    for (let x = r.x - 1; x <= r.x + r.w; x++) for (const y of [r.y - 1, r.y + r.h]) if (g[y][x] === ".") o.push([x, y]);
    for (let y = r.y; y < r.y + r.h; y++) for (const x of [r.x - 1, r.x + r.w]) if (g[y][x] === ".") o.push([x, y]);
    return o;
  };
  /** True when the tiles form one 8-connected group (one doorway, so one key opens it). */
  const joined = (o: Pt[]) => {
    const k = new Set(o.map((p) => p.join())), seen = new Set([o[0].join()]), q: Pt[] = [o[0]];
    for (let i = 0; i < q.length; i++) {
      const [x, y] = q[i];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const n = `${x + dx},${y + dy}`;
        if (k.has(n) && !seen.has(n)) { seen.add(n); q.push([x + dx, y + dy]); }
      }
    }
    return seen.size === o.length;
  };
  /** Lock a room behind doors if that leaves every other non-vault room reachable. */
  const tryVault = (r: Room) => {
    const o = openings(r);
    if (!o.length || o.length > 6 || !joined(o)) return false;
    o.forEach(([x, y]) => (g[y][x] = "D"));
    const d = reach();
    if (!rooms.every((q) => q === r || q.vault || d[q.cy][q.cx] >= 0)) { o.forEach(([x, y]) => (g[y][x] = ".")); return false; }
    r.vault = true;
    r.doors = o;
    return true;
  };

  let D = reach();
  if (!rooms.every((r) => D[r.cy][r.cx] >= 0)) return null;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y][x] === "." && D[y][x] < 0) g[y][x] = "#";

  // exit vault: the farthest room that can be locked; then an optional small treasure vault that doesn't block the exit
  const far = rooms.slice(1).sort((a, b) => D[b.cy][b.cx] - D[a.cy][a.cx]);
  const exitRoom = far.find(tryVault);
  if (!exitRoom) return null;
  const exitDoors = exitRoom.doors!;
  const atExit = (d: Dist) => exitDoors.some(([x, y]) => N4.some(([dx, dy]) => (d[y + dy]?.[x + dx] ?? -1) >= 0));
  const extra = rand.shuffle(far.filter((r) => r !== exitRoom)).find((r) => {
    if (r.w * r.h > 40 || !tryVault(r)) return false;
    if (atExit(reach())) return true;
    r.doors!.forEach(([x, y]) => (g[y][x] = "."));
    r.vault = false;
    return false;
  });
  const open = rooms.filter((r) => !r.vault);

  // gate candidates: corridor cross-sections of 1-3 tiles walled at both ends, plus whole-room doorways
  const cuts = new Map<string, Pt[]>();
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (g[y][x] !== "." || inRoom(x, y)) continue;
    for (const [ax, ay] of [[1, 0], [0, 1]] as Pt[]) {
      let a = 0, b = 0;
      while (g[y - ay * (a + 1)][x - ax * (a + 1)] === "." && !inRoom(x - ax * (a + 1), y - ay * (a + 1)) && a < 3) a++;
      while (g[y + ay * (b + 1)][x + ax * (b + 1)] === "." && !inRoom(x + ax * (b + 1), y + ay * (b + 1)) && b < 3) b++;
      const L = a + b + 1, e1 = g[y - ay * (a + 1)][x - ax * (a + 1)], e2 = g[y + ay * (b + 1)][x + ax * (b + 1)];
      if (L > 3 || e1 !== "#" || e2 !== "#") continue;
      const t: Pt[] = [];
      for (let k = -a; k <= b; k++) t.push([x + ax * k, y + ay * k]);
      cuts.set(t.map((p) => p.join()).join("|"), t);
    }
  }
  for (const r of open) if (r !== start) { const o = openings(r); if (o.length && o.length <= 8) cuts.set(`room${r.x},${r.y}`, o); }

  // gates in sequence: each one cuts the exit off from everything before it
  const nGates = depth === 1 ? 1 : depth < 4 ? 2 : 3;
  let letters = "";
  for (let i = 0; i < nGates; i++) {
    const L = GATES[i], before = reach(letters), prevClosed = i ? reach(letters.slice(0, -1)) : null;
    const valid: { t: Pt[]; score: number }[] = [];
    for (const t of cuts.values()) {
      if (t.some(([x, y]) => g[y][x] !== "." || before[y][x] < 0 || (prevClosed && prevClosed[y][x] >= 0))) continue;
      t.forEach(([x, y]) => (g[y][x] = "="));
      const d = reach(letters);
      if (!atExit(d)) {
        const pre = open.filter((r) => d[r.cy][r.cx] >= 0 && (!prevClosed || prevClosed[r.cy][r.cx] < 0) && r !== start).length;
        const post = open.filter((r) => d[r.cy][r.cx] < 0).length;
        if (pre >= 1 && post >= 1) valid.push({ t, score: Math.min(pre, post) });
      }
      t.forEach(([x, y]) => (g[y][x] = "."));
    }
    if (!valid.length) break;
    const best = Math.max(...valid.map((v) => v.score));
    rand.pick(valid.filter((v) => v.score >= best - 1)).t.forEach(([x, y]) => (g[y][x] = L));
    letters += L;
  }
  if (!letters) return null;

  // region index: 0 = before the first gate, k = behind gate k-1
  const stages: Dist[] = [];
  for (let k = 0; k <= letters.length; k++) stages.push(reach(letters.slice(0, k)));
  const region = (x: number, y: number) => { for (let k = 0; k < stages.length; k++) if (stages[k][y][x] >= 0) return k; return 99; };
  D = stages[stages.length - 1];

  type Test = (x: number, y: number) => boolean;
  const put = (c: string, room: Room, pad = 0, test: Test = () => true): Pt | null => {
    for (let t = 0; t < 60; t++) {
      const x = rand.int(room.x + pad, room.x + room.w - 1 - pad), y = rand.int(room.y + pad, room.y + room.h - 1 - pad);
      if (g[y][x] === "." && test(x, y)) { g[y][x] = c; return [x, y]; }
    }
    return null;
  };
  const spread = (c: string, n: number, pool: Room[], pad = 0, test?: Test): Pt[] => {
    const out: Pt[] = [];
    for (let t = 0; t < n * 30 && out.length < n; t++) { const p = put(c, rand.pick(pool), pad, test); if (p) out.push(p); }
    return out;
  };
  const inRegion = (k: number) => open.filter((r) => region(r.cx, r.cy) === k);

  g[start.cy][start.cx] = "P";
  g[exitRoom.cy][exitRoom.cx] = "X";
  put("$", exitRoom);
  if (extra) { put("$", extra); put("$", extra); put("O", extra); put("F", extra); }
  for (let k = 0; k < letters.length; k++) {
    const pool = inRegion(k).filter((r) => r !== start);
    if (!spread(LEVERS[k], 1, pool.length ? pool : inRegion(k), 0, (x, y) => region(x, y) === k).length) return null;
  }
  const normal = open.filter((r) => r !== start && r !== exitRoom);
  const pool = normal.length ? normal : [start];
  const far2 = (x: number, y: number, n: number) => Math.hypot(x - start.cx, y - start.cy) >= n;
  const gens = Math.min(14, 6 + depth * 2), dens = Math.min(gens - 2, 1 + depth, 6), reapers = Math.min(4, depth);
  const genOk: Test = (x, y) => {
    if (D[y][x] < 8 || !far2(x, y, 7)) return false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ("#DGLPXabcxyz".includes(g[y + dy][x + dx])) return false;
    return true;
  };
  spread("L", dens, pool, 1, genOk);
  spread("G", gens - dens, pool, 1, genOk);
  for (let k = 0; k < stages.length; k++) { const rs = inRegion(k); if (rs.length) spread("F", 1, rs, 0, (x, y) => region(x, y) === k); }
  spread("F", Math.max(1, 5 - stages.length), open, 0);
  for (const [x, y] of spread("R", reapers, pool, 0, (x, y) => D[y][x] >= 14 && far2(x, y, 13))) {
    const k = region(x, y);
    spread("O", 1, open.filter((r) => region(r.cx, r.cy) <= k), 0, (px, py) => region(px, py) <= k);
  }
  spread("K", 1 + (extra ? 1 : 0), open, 0, (x, y) => D[y][x] >= 10);
  spread("$", 3, pool, 0);

  // area features
  if (area === AREA.CRYPT) spread("S", 3 + Math.min(3, depth), pool, 1, genOk);
  if (area === AREA.CATACOMBS)
    rand.shuffle([...cuts.values()].filter((t) => t.length <= 3 && t.every(([x, y]) => g[y][x] === ".")))
      .slice(0, 5 + (depth % 5))
      .forEach((t) => t.forEach(([x, y]) => (g[y][x] = "^")));
  if (area === AREA.PLAGUE)
    for (let n = 0; n < 5; n++) {
      const r = rand.pick(pool), cx = rand.int(r.x + 1, r.x + r.w - 2), cy = rand.int(r.y + 1, r.y + r.h - 2);
      for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 2; x <= cx + 2; x++)
        if (g[y][x] === "." && inRoom(x, y) && rand.next() < 0.75) g[y][x] = "~";
    }

  const out: FloorMap = g.map((r) => r.join(""));
  out.tents = rooms.filter((r) => r.tent).map((r): Tent => [r.x, r.y, r.w, r.h]);
  return out;
}
