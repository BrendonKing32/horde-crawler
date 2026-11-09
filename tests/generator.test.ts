import { describe, expect, it } from "vitest";
import { AREA, GATES, LEVERS, areaOf, buildFloor, type FloorMap } from "../src/gen/generator";

type Pt = [number, number];
const N4: Pt[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const SOLID = "#tGLSHQ"; // walls, trees, spawners, coffins, hidden passages, quicksand

function find(m: string[], c: string): Pt[] {
  const out: Pt[] = [];
  m.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === c) out.push([x, y]); }));
  return out;
}

function reachableIgnoringObjects(m: string[], openGates: string, reveal: boolean): Set<number> {
  const [start] = find(m, "P"), width = m[0].length;
  const seen = new Set([start[1] * width + start[0]]), queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i];
    for (const [dx, dy] of N4) {
      const nx = x + dx, ny = y + dy, c = m[ny]?.[nx], key = ny * width + nx;
      if (!c || c === "#" || c === "D" || (c === "H" && !reveal) || (GATES.includes(c) && !openGates.includes(c)) || seen.has(key)) continue;
      seen.add(key); queue.push([nx, ny]);
    }
  }
  return seen;
}

/**
 * Play the floor greedily: pull every reachable lever, spend keys on reachable doorways,
 * repeat until the exit is reachable or nothing changes. Records rule violations on the way.
 */
function playThrough(m: FloorMap) {
  const W = m[0].length;
  const [P] = find(m, "P"), [X] = find(m, "X");
  const problems: string[] = [];
  const opened = new Set<number>(); // door tiles opened with a key
  const usedKeys = new Set<string>();
  let gatesOpen = "";

  const reach = () => {
    const seen = new Set([P[1] * W + P[0]]), q: Pt[] = [P];
    for (let i = 0; i < q.length; i++) {
      const [x, y] = q[i];
      for (const [dx, dy] of N4) {
        const X2 = x + dx, Y2 = y + dy, c = m[Y2][X2], k = Y2 * W + X2;
        if (seen.has(k) || SOLID.includes(c)) continue;
        if (c === "D" && !opened.has(k)) continue;
        if (GATES.includes(c) && !gatesOpen.includes(c)) continue;
        seen.add(k); q.push([X2, Y2]);
      }
    }
    return seen;
  };
  const has = (r: Set<number>, [x, y]: Pt) => r.has(y * W + x);

  for (let step = 0; step < 30; step++) {
    const r = reach();
    if (has(r, X)) break;
    let progress = false;
    for (let i = 0; i < 3; i++) {
      const gate = GATES[i];
      if (gatesOpen.includes(gate)) continue;
      for (const lv of find(m, LEVERS[i])) if (has(r, lv)) {
        if (!find(m, "F").some((f) => has(r, f))) problems.push(`no food before gate ${gate}`);
        gatesOpen += gate; progress = true;
      }
    }
    if (progress) continue;
    const key = find(m, "K").find((k) => has(r, k) && !usedKeys.has(k.join()));
    const door = find(m, "D").find(([x, y]) => !opened.has(y * W + x) && N4.some(([dx, dy]) => r.has((y + dy) * W + x + dx)));
    if (key && door) {
      usedKeys.add(key.join());
      const st: Pt[] = [door];
      while (st.length) {
        const [x, y] = st.pop()!, k = y * W + x;
        if (m[y]?.[x] !== "D" || opened.has(k)) continue;
        opened.add(k);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) st.push([x + dx, y + dy]);
      }
      continue;
    }
    break;
  }
  if (!has(reach(), X)) problems.push("exit unreachable");
  return { problems, gates: gatesOpen.length };
}

const FLOORS_PER_DEPTH = 24;

describe("floor generator", () => {
  it("maps floors to areas every five floors", () => {
    expect([1, 5, 6, 11, 16, 21, 26, 31, 36, 41, 46, 51].map(areaOf)).toEqual([
      AREA.CRYPT, AREA.CRYPT, AREA.CAVERNS, AREA.CATACOMBS, AREA.PLAGUE, AREA.CARNIVAL,
      AREA.ARCHIVE, AREA.FOUNDRY, AREA.HOLLOW, AREA.OBSERVATORY, AREA.DESERT, AREA.CRYPT,
    ]);
  });

  it("is deterministic for a seed", () => {
    expect(buildFloor(1234, 7).join("\n")).toBe(buildFloor(1234, 7).join("\n"));
  });

  for (let depth = 1; depth <= 50; depth++) {
    it(`floor ${depth}: every floor is winnable and follows the placement rules`, () => {
      for (let s = 0; s < FLOORS_PER_DEPTH; s++) {
        const m = buildFloor(s * 7919 + depth, depth);
        expect(m.length).toBe(32);
        expect(m.every((row) => row.length === 44)).toBe(true);
        expect(find(m, "P")).toHaveLength(1);
        expect(find(m, "X")).toHaveLength(1);
        // every gate on the floor has exactly one matching lever
        for (let i = 0; i < 3; i++) if (find(m, GATES[i]).length) expect(find(m, LEVERS[i])).toHaveLength(1);
        const { problems, gates } = playThrough(m);
        expect(problems, `seed ${s * 7919 + depth}\n${m.join("\n")}`).toEqual([]);
        expect(gates).toBeGreaterThanOrEqual(1);
        // area features only appear in their area
        const area = areaOf(depth);
        expect(find(m, "S").length > 0).toBe(area === AREA.CRYPT);
        if (area !== AREA.CATACOMBS) expect(find(m, "^")).toHaveLength(0);
        if (area !== AREA.PLAGUE) expect(find(m, "~")).toHaveLength(0);
        if (area !== AREA.CARNIVAL) expect(m.tents ?? []).toHaveLength(0);
        if (area === AREA.CARNIVAL) expect(find(m, "t").length).toBeGreaterThan(0);
        else expect(find(m, "t")).toHaveLength(0);
        for (const [feature, owner] of [["V", AREA.FOUNDRY], ["M", AREA.FOUNDRY], ["U", AREA.HOLLOW], ["H", AREA.OBSERVATORY], ["Q", AREA.DESERT]] as const) {
          if (area !== owner) expect(find(m, feature)).toHaveLength(0);
          else expect(find(m, feature).length).toBeGreaterThan(0);
        }
        if (area === AREA.OBSERVATORY) for (let i = 0; i <= 3; i++) {
          const before = reachableIgnoringObjects(m, GATES.slice(0, i), false);
          const after = reachableIgnoringObjects(m, GATES.slice(0, i), true);
          for (const key of after) if (m[Math.floor(key / 44)][key % 44] !== "H")
            expect(before.has(key), `revealed passage bypassed a gate at seed ${s * 7919 + depth}`).toBe(true);
        }
      }
    }, 30_000);
  }

  it("gives every reaper a potion it can reach first", () => {
    for (let s = 0; s < 40; s++) {
      const depth = 2 + (s % 49), m = buildFloor(s * 31, depth);
      expect(find(m, "O").length).toBeGreaterThanOrEqual(find(m, "R").length);
    }
  });
});
