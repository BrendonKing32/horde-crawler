import { afterEach, describe, expect, it, vi } from "vitest";
import { blast, usePotion } from "../src/game/actions";
import { T } from "../src/game/constants";
import type { Enemy } from "../src/game/types";
import { update } from "../src/game/update";
import { blocked } from "../src/game/world";
import { newFloor, settings } from "../src/game/state";

vi.mock("../src/game/narrator", () => ({ say: vi.fn(), sayOnce: vi.fn(), pop: vi.fn(), tickNarrator: vi.fn() }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function enemy(x: number, y: number, type: Enemy["type"] = "biter"): Enemy {
  return { type, x, y, r: 6, hp: type === "reaper" ? Infinity : 100, speed: 0, cd: 10, side: 1, dead: false };
}

describe("potion balance", () => {
  it("uses twice the shot blast radius, independent of the camera", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    const world = newFloor();
    world.coffins = [];
    const { x, y } = world.p;
    const distances = [149, 150, 299, 300, 400];
    world.enemies = distances.map((d) => enemy(x + d, y, "reaper"));
    blast(x, y);
    expect(world.enemies.map((e) => e.dead)).toEqual([true, false, false, false, false]);

    world.enemies = distances.map((d) => enemy(x, y + d, "reaper"));
    // No camera is needed for a local blast.
    expect(world.cam).toBeNull();
    usePotion();
    expect(world.enemies.map((e) => e.dead)).toEqual([true, true, true, false, false]);
    expect(world.p.potions).toBe(0);
  });

  it("damages only close generators and keeps boss damage unchanged", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    const world = newFloor();
    world.coffins = [];
    const { x, y } = world.p;
    const template = world.gens[0];
    world.gens = [149, 150, 299].map((d) => ({ ...template, x: x + d, y, hp: 9 }));
    world.enemies = [enemy(x + 299, y, "boss"), enemy(x + 300, y, "boss")];
    usePotion();
    expect(world.gens.map((g) => g.hp)).toEqual([6, 9, 9]);
    expect(world.enemies.map((e) => e.hp)).toEqual([75, 100]);
  });

  it("clears hazards, bones and coffins only inside the local radius", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    const world = newFloor();
    const points = [299, 300].map((d) => ({ x: world.p.x + d, y: world.p.y }));
    world.bombs = points.map(({ x, y }) => ({ sx: x, sy: y, tx: x, ty: y, t: 0, dur: 1 }));
    world.balloons = points.map((p) => ({ ...p, vx: 0, vy: 0, t: 1, c: "red" }));
    world.enemyShots = points.map((p) => ({ ...p, vx: 0, vy: 0, life: 1 }));
    world.clouds = points.map((p) => ({ ...p, r: 20, t: 1, seed: 0 }));
    world.bones = points.map((p) => ({ ...p, t: 1 }));
    world.coffins = points.map((p) => ({ ...p, tx: 0, ty: 0, hp: 6, hit: 0, alive: true }));
    usePotion();
    expect(world.bombs.map((b) => b.tx)).toEqual([points[1].x]);
    for (const hazards of [world.balloons, world.enemyShots, world.clouds, world.bones])
      expect(hazards.map((h) => h.x)).toEqual([points[1].x]);
    expect(world.coffins.map((c) => c.hp)).toEqual([3, 6]);
  });

  it("does nothing without a potion", () => {
    const world = newFloor();
    world.p.potions = 0;
    world.enemies = [enemy(world.p.x, world.p.y)];
    usePotion();
    expect(world.enemies[0].dead).toBe(false);
    expect(world.flash).toBe(0);
  });
});

describe("spawner balance", () => {
  it.each(["horde", "lobber"] as const)("shortens %s cooldowns by 35 percent at every tier", (kind) => {
    const world = newFloor();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    world.grid = Array.from({ length: world.rows }, () => Array<string>(world.cols).fill("."));
    world.genAt.clear(); world.coffinAt.clear(); world.coffins = [];
    world.pickups = []; world.levers = []; world.exit = null;
    world.p.x = 5.5 * T; world.p.y = 5.5 * T;
    const template = world.gens[0];
    for (const tier of [1, 2, 3]) {
      const gen = { ...template, kind, tier, x: 8.5 * T, y: 5.5 * T, tx: 8, ty: 5, t: 0, n: 0 };
      world.gens = [gen]; world.enemies = [];
      update(0.01);
      expect(world.enemies).toHaveLength(1);
      expect(gen.t).toBeCloseTo((2.8 - tier * 0.5) * 0.65);
      update(gen.t - 0.001);
      expect(world.enemies).toHaveLength(1);
      update(0.002);
      expect(world.enemies).toHaveLength(2);
    }
  });
});

describe("area champions", () => {
  it("spawns one unblocked champion on each fifth floor only", () => {
    const previousDepth = settings.startDepth;
    try {
      settings.startDepth = 5;
      const bossFloor = newFloor();
      const bosses = bossFloor.enemies.filter((enemy) => enemy.type === "boss");
      expect(bossFloor.bossFloor).toBe(true);
      expect(bossFloor.bossDefeated).toBe(false);
      expect(bosses).toHaveLength(1);
      expect(blocked(bosses[0])).toBe(false);

      settings.startDepth = 6;
      const regularFloor = newFloor();
      expect(regularFloor.bossFloor).toBe(false);
      expect(regularFloor.enemies.some((enemy) => enemy.type === "boss")).toBe(false);
    } finally {
      settings.startDepth = previousDepth;
    }
  });
});
