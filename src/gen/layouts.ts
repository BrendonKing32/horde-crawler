/**
 * Area layouts. Each one carves floor ("." tiles) into a grid of walls ("#") and returns
 * the list of rooms. rooms[0] is the start room. Shared placement (vaults, gates, items)
 * happens afterwards in generator.ts, so layouts only need to guarantee rooms + floor.
 *
 * IMPORTANT: the order of RNG calls defines the map for a seed. Changing call order
 * changes every seeded floor, which is fine, but do it on purpose.
 */
import type { Rand } from "./rng";

export const W = 44;
export const H = 32;

export type Pt = [number, number];
export type Grid = string[][];

export interface Room {
  x: number; y: number; w: number; h: number;
  cx: number; cy: number;
  vault?: boolean;
  doors?: Pt[];
  rough?: boolean;
  tent?: boolean;
}

interface CellRoom extends Room { ci: number; cj: number; cw: number; ch: number }

export interface LayoutKit {
  g: Grid;
  rand: Rand;
  ok: (x: number, y: number) => boolean;
  carve: (x: number, y: number) => void;
  placeRooms: (max: number, minW: number, maxW: number, minH: number, maxH: number) => Room[];
  fillRoom: (r: Room) => void;
  mst: (rs: Room[], link: (a: Room, b: Room) => void) => void;
}

export function makeKit(rand: Rand): LayoutKit {
  const g: Grid = Array.from({ length: H }, () => Array<string>(W).fill("#"));
  const ok = (x: number, y: number) => x > 0 && y > 0 && x < W - 1 && y < H - 1;
  const carve = (x: number, y: number) => {
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) if (ok(x + dx, y + dy)) g[y + dy][x + dx] = ".";
  };
  const dist = (a: Room, b: Room) => Math.abs(a.cx - b.cx) + Math.abs(a.cy - b.cy);
  const placeRooms: LayoutKit["placeRooms"] = (max, minW, maxW, minH, maxH) => {
    const rs: Room[] = [];
    for (let i = 0; i < 300 && rs.length < max; i++) {
      const w = rand.int(minW, maxW), h = rand.int(minH, maxH), x = rand.int(1, W - w - 1), y = rand.int(1, H - h - 1);
      if (rs.some((r) => x < r.x + r.w + 2 && x + w + 2 > r.x && y < r.y + r.h + 2 && y + h + 2 > r.y)) continue;
      rs.push({ x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1) });
    }
    return rs;
  };
  const fillRoom = (r: Room) => {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) g[y][x] = ".";
  };
  /** Connect rooms with a minimum spanning tree (by Manhattan distance), plus two random extra links for loops. */
  const mst: LayoutKit["mst"] = (rs, link) => {
    const tree = [rs[0]], rest = rs.slice(1);
    while (rest.length) {
      let pair: [Room, Room] | null = null, bi = 0, bd = 1e9;
      for (const a of tree) rest.forEach((b, i) => { const d = dist(a, b); if (d < bd) { bd = d; pair = [a, b]; bi = i; } });
      const [a, b] = pair as unknown as [Room, Room];
      link(a, b);
      tree.push(rest.splice(bi, 1)[0]);
    }
    for (let i = 0; i < 2; i++) { const a = rand.pick(rs), b = rand.pick(rs); if (a !== b) link(a, b); }
  };
  return { g, rand, ok, carve, placeRooms, fillRoom, mst };
}

/** Straight L-shaped 2-wide corridor between two room centres. */
function lCorridor(k: LayoutKit, a: Room, b: Room) {
  let x = a.cx, y = a.cy;
  const hx = () => { while (x !== b.cx) { k.carve(x, y); x += Math.sign(b.cx - x); } };
  const vy = () => { while (y !== b.cy) { k.carve(x, y); y += Math.sign(b.cy - y); } };
  if (k.rand.next() < 0.5) { hx(); vy(); } else { vy(); hx(); }
  k.carve(x, y);
}

/** CRYPT: rectangular rooms joined by straight corridors. */
export function crypt(k: LayoutKit): Room[] {
  const rooms = k.placeRooms(12, 5, 10, 4, 8);
  rooms.forEach(k.fillRoom);
  k.mst(rooms, (a, b) => lCorridor(k, a, b));
  return rooms;
}

/** CAVERNS: winding drunk-walk tunnels, ragged chambers, side pockets; a few clean carved chambers stay vault-able. */
export function caverns(k: LayoutKit): Room[] {
  const { g, rand, ok } = k;
  const rooms = k.placeRooms(11, 5, 9, 4, 7);
  rooms.forEach(k.fillRoom);
  k.mst(rooms, (a, b) => {
    let x = a.cx, y = a.cy;
    for (let s = 0; s < 600 && (x !== b.cx || y !== b.cy); s++) {
      k.carve(x, y);
      if (rand.next() < 0.62) {
        if (x !== b.cx && (y === b.cy || rand.next() < 0.5)) x += Math.sign(b.cx - x);
        else y += Math.sign(b.cy - y);
      } else {
        const d = rand.pick<Pt>([[1, 0], [-1, 0], [0, 1], [0, -1]]);
        if (ok(x + d[0], y + d[1]) && ok(x + d[0] + 1, y + d[1] + 1)) { x += d[0]; y += d[1]; }
      }
    }
    k.carve(x, y);
  });
  const blob = (cx: number, cy: number, r: number) => {
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++)
      if (ok(x, y) && x > 1 && y > 1 && x < W - 2 && y < H - 2 && (x - cx) ** 2 + (y - cy) ** 2 <= r * r + rand.next() * 2) g[y][x] = ".";
  };
  const clean = new Set(rand.shuffle(rooms.slice(1)).slice(0, 4));
  for (const r of rooms) {
    if (clean.has(r)) continue;
    r.rough = true;
    for (let n = 0; n < 5; n++) {
      const side = rand.int(0, 3);
      const x = side < 2 ? rand.int(r.x, r.x + r.w - 1) : side === 2 ? r.x : r.x + r.w - 1;
      const y = side >= 2 ? rand.int(r.y, r.y + r.h - 1) : side === 0 ? r.y : r.y + r.h - 1;
      blob(x, y, rand.int(1, 2));
    }
  }
  const floors: Pt[] = [];
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++)
    if (g[y][x] === "." && !rooms.some((r) => x >= r.x - 3 && x < r.x + r.w + 3 && y >= r.y - 3 && y < r.y + r.h + 3)) floors.push([x, y]);
  for (let n = 0; n < 6 && floors.length; n++) { const [x, y] = rand.pick(floors); blob(x, y, rand.int(2, 3)); }
  return rooms;
}

/** CATACOMBS: 2-wide maze on a 3-tile cell grid; chambers walled off with 1-3 doorways; light braiding. */
export function catacombs(k: LayoutKit): Room[] {
  const { g, rand } = k;
  const CW = 14, CH = 10;
  const room: (CellRoom | null)[][] = Array.from({ length: CH }, () => Array<CellRoom | null>(CW).fill(null));
  const rooms: CellRoom[] = [];
  for (let i = 0; i < 300 && rooms.length < 9; i++) {
    const cw = rand.int(2, 3), chh = rand.int(2, 3), ci = rand.int(0, CW - cw), cj = rand.int(0, CH - chh);
    if (rooms.some((r) => ci < r.ci + r.cw + 1 && ci + cw + 1 > r.ci && cj < r.cj + r.ch + 1 && cj + chh + 1 > r.cj)) continue;
    const x = 1 + 3 * ci, y = 1 + 3 * cj, w = 3 * cw - 1, h = 3 * chh - 1;
    const r: CellRoom = { ci, cj, cw, ch: chh, x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1) };
    rooms.push(r);
    for (let j = cj; j < cj + chh; j++) for (let i2 = ci; i2 < ci + cw; i2++) room[j][i2] = r;
  }
  const cellXY = (i: number, j: number): Pt => [1 + 3 * i, 1 + 3 * j];
  const seen = room.map((row) => row.map((c) => !!c));
  const openWall = (i: number, j: number, i2: number, j2: number) => {
    const [x, y] = cellXY(Math.min(i, i2), Math.min(j, j2));
    if (i !== i2) { g[y][x + 2] = "."; g[y + 1][x + 2] = "."; } else { g[y + 2][x] = "."; g[y + 2][x + 1] = "."; }
  };
  const carveCell = (i: number, j: number) => { const [x, y] = cellXY(i, j); g[y][x] = g[y][x + 1] = g[y + 1][x] = g[y + 1][x + 1] = "."; };
  const N: Pt[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  // recursive backtracker over every non-room cell
  for (let j0 = 0; j0 < CH; j0++) for (let i0 = 0; i0 < CW; i0++) {
    if (seen[j0][i0]) continue;
    const st: Pt[] = [[i0, j0]];
    seen[j0][i0] = true; carveCell(i0, j0);
    while (st.length) {
      const [i, j] = st[st.length - 1];
      const nb = N.map(([a, b]): Pt => [i + a, j + b]).filter(([a, b]) => a >= 0 && b >= 0 && a < CW && b < CH && !seen[b][a]);
      if (!nb.length) { st.pop(); continue; }
      const [a, b] = rand.pick(nb);
      seen[b][a] = true; carveCell(a, b); openWall(i, j, a, b); st.push([a, b]);
    }
  }
  // braid: knock out some walls between corridor cells to create loops
  for (let n = 0; n < 26; n++) {
    const i = rand.int(0, CW - 1), j = rand.int(0, CH - 1), [a, b] = rand.pick(N), i2 = i + a, j2 = j + b;
    if (i2 >= 0 && j2 >= 0 && i2 < CW && j2 < CH && !room[j][i] && !room[j2][i2]) openWall(i, j, i2, j2);
  }
  for (const r of rooms) {
    k.fillRoom(r);
    const doors: [number, number, number, number][] = [];
    for (let j = r.cj; j < r.cj + r.ch; j++) for (let i = r.ci; i < r.ci + r.cw; i++) for (const [a, b] of N) {
      const i2 = i + a, j2 = j + b;
      if (i2 >= 0 && j2 >= 0 && i2 < CW && j2 < CH && room[j2][i2] !== r) doors.push([i, j, i2, j2]);
    }
    for (const d of rand.shuffle(doors).slice(0, rand.int(1, 3))) openWall(...d);
  }
  return rooms;
}

/** PLAGUE WARD: binary space partition packs cells tightly; short crooked connectors. */
export function plagueWard(k: LayoutKit): Room[] {
  const { rand } = k;
  const leaves: { x: number; y: number; w: number; h: number }[] = [];
  const split = (x: number, y: number, w: number, h: number, d: number): void => {
    const canH = h >= 12, canV = w >= 14;
    if (d > 0 && (canH || canV) && !(w * h < 160 && rand.next() < 0.3)) {
      const horiz = canH && (!canV || h > w || (h === w && rand.next() < 0.5));
      if (horiz) { const c = rand.int(6, h - 6); split(x, y, w, c, d - 1); split(x, y + c, w, h - c, d - 1); }
      else { const c = rand.int(7, w - 7); split(x, y, c, h, d - 1); split(x + c, y, w - c, h, d - 1); }
      return;
    }
    leaves.push({ x, y, w, h });
  };
  split(1, 1, W - 2, H - 2, 6);
  const rooms = rand.shuffle(
    leaves.map((l): Room => {
      const w = rand.int(Math.max(4, l.w - 5), l.w - 2), h = rand.int(Math.max(3, l.h - 4), l.h - 2);
      const x = l.x + 1 + rand.int(0, l.w - 2 - w), y = l.y + 1 + rand.int(0, l.h - 2 - h);
      return { x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1) };
    }).filter((r) => r.w >= 4 && r.h >= 4),
  );
  rooms.forEach(k.fillRoom);
  k.mst(rooms, (a, b) => lCorridor(k, a, b));
  return rooms;
}

/**
 * CARNIVAL fairgrounds: open plots split by fences; turnstile gaps join plots via a random
 * spanning tree plus a few extras. About half the plots hold a striped tent tucked into a
 * corner with one flap entrance (natural vaults). Returns null if a fence can't get a gap.
 */
export function fairgrounds(k: LayoutKit): Room[] | null {
  const { g, rand } = k;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) g[y][x] = ".";
  const nc = rand.int(3, 4), nr = 3, xs = [0], ys = [0];
  for (let i = 1; i < nc; i++) xs.push(Math.round((i * (W - 1)) / nc) + rand.int(-1, 1));
  xs.push(W - 1);
  for (let j = 1; j < nr; j++) ys.push(Math.round((j * (H - 1)) / nr) + rand.int(-1, 1));
  ys.push(H - 1);
  for (const x of xs.slice(1, -1)) for (let y = 1; y < H - 1; y++) g[y][x] = "#";
  for (const y of ys.slice(1, -1)) for (let x = 1; x < W - 1; x++) g[y][x] = "#";
  interface Plot { i: number; j: number; x: number; y: number; w: number; h: number }
  const plots: Plot[] = [];
  for (let j = 0; j < nr; j++) for (let i = 0; i < nc; i++)
    plots.push({ i, j, x: xs[i] + 1, y: ys[j] + 1, w: xs[i + 1] - xs[i] - 1, h: ys[j + 1] - ys[j] - 1 });
  const rooms: Room[] = [];
  rand.shuffle(plots.slice()).forEach((pl, n) => {
    if (n === 0 || rand.next() >= 0.55 || pl.w < 9 || pl.h < 8) {
      rooms.push({ x: pl.x, y: pl.y, w: pl.w, h: pl.h, cx: pl.x + (pl.w >> 1), cy: pl.y + (pl.h >> 1) });
      return;
    }
    const tw = rand.int(5, Math.min(9, pl.w - 4)), th = rand.int(4, Math.min(6, pl.h - 4));
    const left = rand.next() < 0.5, top = rand.next() < 0.5;
    const rx = left ? pl.x + 1 : pl.x + pl.w - 1 - tw, ry = top ? pl.y + 1 : pl.y + pl.h - 1 - th;
    for (let y = ry - 1; y <= ry + th; y++) for (let x = rx - 1; x <= rx + tw; x++)
      if (x < rx || x >= rx + tw || y < ry || y >= ry + th) g[y][x] = "#";
    if (rand.next() < 0.5) { const fx = left ? rx + tw : rx - 1, fy = rand.int(ry, ry + th - 2); g[fy][fx] = g[fy + 1][fx] = "."; }
    else { const fy = top ? ry + th : ry - 1, fx = rand.int(rx, rx + tw - 2); g[fy][fx] = g[fy][fx + 1] = "."; }
    rooms.push({ x: rx, y: ry, w: tw, h: th, cx: rx + (tw >> 1), cy: ry + (th >> 1), tent: true });
  });
  // union-find spanning tree over plot adjacency
  const par = plots.map((_, i) => i);
  const find = (i: number): number => (par[i] === i ? i : (par[i] = find(par[i])));
  const edges: [Plot, Plot][] = [];
  for (const pl of plots) {
    if (pl.i < nc - 1) edges.push([pl, plots[pl.j * nc + pl.i + 1]]);
    if (pl.j < nr - 1) edges.push([pl, plots[(pl.j + 1) * nc + pl.i]]);
  }
  rand.shuffle(edges);
  const chosen: [Plot, Plot][] = [], spare: [Plot, Plot][] = [];
  for (const e of edges) {
    const a = find(e[0].j * nc + e[0].i), b = find(e[1].j * nc + e[1].i);
    if (a !== b) { par[a] = b; chosen.push(e); } else spare.push(e);
  }
  chosen.push(...spare.slice(0, rand.int(1, 3)));
  for (const [a, b] of chosen) {
    const cand: Pt[][] = [];
    if (a.j === b.j) {
      const x = xs[a.i + 1];
      for (let y = a.y; y < a.y + a.h - 1; y++)
        if (g[y][x - 1] === "." && g[y + 1][x - 1] === "." && g[y][x + 1] === "." && g[y + 1][x + 1] === ".") cand.push([[x, y], [x, y + 1]]);
    } else {
      const y = ys[a.j + 1];
      for (let x = a.x; x < a.x + a.w - 1; x++)
        if (g[y - 1][x] === "." && g[y - 1][x + 1] === "." && g[y + 1][x] === "." && g[y + 1][x + 1] === ".") cand.push([[x, y], [x + 1, y]]);
    }
    if (!cand.length) return null;
    rand.pick(cand).forEach(([x, y]) => (g[y][x] = "."));
  }
  return rooms;
}
