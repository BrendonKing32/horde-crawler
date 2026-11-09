import { describe, expect, it, vi } from "vitest";
import { highTide, inAstralBeam } from "../src/game/area-mechanics";
import { T } from "../src/game/constants";
import { newFloor, settings } from "../src/game/state";
import { solidAt } from "../src/game/world";
import { updateHazards } from "../src/game/hazards";
import { updateEnemies } from "../src/game/enemies";

vi.mock("../src/game/narrator", () => ({ say: vi.fn(), sayOnce: vi.fn(), pop: vi.fn() }));

describe("new area mechanics", () => {
  it("alternates the archive tide every six seconds", () => {
    expect(highTide(0)).toBe(false);
    expect(highTide(6)).toBe(true);
    expect(highTide(12)).toBe(false);
  });

  it("sweeps a directional beam across the floor", () => {
    expect(inAstralBeam(200, 100, 200, 200, 0)).toBe(true);
    expect(inAstralBeam(0, 100, 200, 200, 0)).toBe(false);
    expect(inAstralBeam(100, 200, 200, 200, Math.PI / 0.7)).toBe(true);
    expect(inAstralBeam(200, 100 + T, 200, 200, 0)).toBe(false);
  });

  it("loads each area's features and blocks unrevealed passages", () => {
    const previousDepth = settings.startDepth;
    try {
      settings.startDepth = 31;
      const foundry = newFloor();
      expect(foundry.conveyors.size).toBeGreaterThan(0);
      expect(foundry.traps.some((trap) => trap.kind === "press")).toBe(true);
      settings.startDepth = 36;
      expect(newFloor().spores.size).toBeGreaterThan(0);
      settings.startDepth = 41;
      const observatory = newFloor();
      expect(observatory.hidden.size).toBeGreaterThan(0);
      const key = [...observatory.hidden][0];
      expect(solidAt(key % observatory.cols, Math.floor(key / observatory.cols))).toBe(true);
    } finally {
      settings.startDepth = previousDepth;
    }
  });

  it("applies the tide, pushes on conveyors, and bursts spores", () => {
    const previousDepth = settings.startDepth;
    try {
      settings.startDepth = 26;
      let world = newFloor();
      world.enemies = []; world.time = 6;
      updateHazards(0.1);
      expect(world.p.slowF).toBe(0.65);
      world.time = 12;
      updateHazards(0.1);
      expect(world.p.slowF).toBe(1);

      settings.startDepth = 31;
      world = newFloor();
      world.enemies = []; world.traps = [];
      const tx = Math.floor(world.p.x / T), ty = Math.floor(world.p.y / T);
      world.conveyors.add(ty * world.cols + tx);
      world.time = ty % 2 ? 4 : 0;
      const x = world.p.x;
      updateHazards(0.1);
      expect(world.p.x).toBeGreaterThan(x);

      settings.startDepth = 36;
      world = newFloor();
      world.enemies = []; world.spores.clear();
      const key = Math.floor(world.p.y / T) * world.cols + Math.floor(world.p.x / T);
      world.spores.add(key);
      updateHazards(0.1);
      expect(world.spores.has(key)).toBe(false);
      expect(world.clouds).toHaveLength(1);
      updateHazards(0.1);
      expect(world.p.slowF).toBe(0.55);
    } finally {
      settings.startDepth = previousDepth;
    }
  });

  it("reveals hidden passages in the rotating beam", () => {
    const previousDepth = settings.startDepth;
    try {
      settings.startDepth = 41;
      const world = newFloor();
      world.enemies = [];
      const key = [...world.hidden][0], x = key % world.cols, y = Math.floor(key / world.cols);
      world.time = (Math.atan2((y + 0.5) * T - world.mh / 2, (x + 0.5) * T - world.mw / 2) + Math.PI * 2) / 0.35;
      updateHazards(0.01);
      expect(world.hidden.has(key)).toBe(false);
      expect(solidAt(x, y)).toBe(false);
    } finally {
      settings.startDepth = previousDepth;
    }
  });

  it("lets hollow enemies leave spores on nearby floor", () => {
    const previousDepth = settings.startDepth;
    try {
      settings.startDepth = 36;
      const world = newFloor();
      world.spores.clear();
      const e = { type: "grunt" as const, x: world.p.x, y: world.p.y, r: 10, hp: 2, speed: 0, cd: 10, side: 1, dead: false, sporeCd: 0 };
      world.enemies = [e];
      updateEnemies(0.01);
      expect(world.spores.size).toBe(1);
      updateHazards(0.01);
      expect(world.spores.size).toBe(1);
    } finally {
      settings.startDepth = previousDepth;
    }
  });

  it("spawns drowned grunts near shelves only during high tide", () => {
    const previousDepth = settings.startDepth;
    try {
      settings.startDepth = 26;
      const world = newFloor();
      world.enemies = []; world.gens = []; world.genAt.clear();
      world.grid = Array.from({ length: world.rows }, () => Array<string>(world.cols).fill("#"));
      world.p.x = 10.5 * T; world.p.y = 10.5 * T;
      world.grid[10][10] = world.grid[10][15] = ".";
      world.shelfT = 0; world.time = 0;
      updateHazards(0.1);
      expect(world.enemies).toHaveLength(0);
      world.time = 6;
      updateHazards(0.1);
      expect(world.enemies).toHaveLength(1);
      expect(world.enemies[0].type).toBe("grunt");
      expect(world.enemies[0].x).toBe(15.5 * T);
    } finally {
      settings.startDepth = previousDepth;
    }
  });

  it("damages the player and enemies once per press cycle", () => {
    const previousDepth = settings.startDepth;
    try {
      settings.startDepth = 31;
      const world = newFloor();
      world.conveyors.clear();
      const { x, y } = world.p;
      const enemy = { type: "grunt" as const, x, y, r: 10, hp: 10, speed: 0, cd: 10, side: 1, dead: false };
      world.enemies = [enemy];
      world.traps = [{ tx: Math.floor(x / T), ty: Math.floor(y / T), x, y, kind: "press", ph: 0, hitE: new Set() }];
      world.time = 0;
      const hp = world.p.hp;
      updateHazards(0.1);
      expect(world.p.hp).toBeLessThan(hp);
      expect(enemy.hp).toBe(8);
      const after = world.p.hp;
      updateHazards(0.1);
      expect(world.p.hp).toBe(after);
      expect(enemy.hp).toBe(8);
      world.time = 2.4;
      updateHazards(0.1);
      expect(enemy.hp).toBe(6);
      expect(world.p.hp).toBeLessThan(after);
    } finally {
      settings.startDepth = previousDepth;
    }
  });
});
