import { describe, expect, it, vi } from "vitest";
import { AREAS, T } from "../src/game/constants";
import { spawnFrom } from "../src/game/actions";
import { updateEnemies } from "../src/game/enemies";
import { updateHazards } from "../src/game/hazards";
import { newFloor, settings } from "../src/game/state";
import { update } from "../src/game/update";
import { move, solidAt } from "../src/game/world";

vi.mock("../src/game/narrator", () => ({ say: vi.fn(), sayOnce: vi.fn(), pop: vi.fn(), tickNarrator: vi.fn() }));

describe("desert", () => {
  it("blocks movement but permits both sides to shoot over quicksand", () => {
    const previousDepth = settings.startDepth;
    try {
      settings.startDepth = 46;
      const world = newFloor();
      world.grid = Array.from({ length: world.rows }, () => Array<string>(world.cols).fill("."));
      world.genAt.clear(); world.gens = []; world.pickups = []; world.enemies = [];
      world.exit = null; world.time = 0;
      world.p.x = 5.5 * T; world.p.y = 5.5 * T;
      world.grid[5][6] = "Q";
      expect(solidAt(6, 5)).toBe(true);
      expect(solidAt(6, 5, true)).toBe(false);
      expect(move(world.p, T, 0)).toBe(false);
      world.shots.push({ x: world.p.x, y: world.p.y, vx: 160, vy: 0, life: 2, dmg: 1, pierce: 0, hits: new Set() });
      update(0.2);
      expect(world.shots).toHaveLength(1);
      expect(Math.floor(world.shots[0].x / T)).toBe(6);
      world.enemies.push({ type: "grunt", x: 7.5 * T, y: world.p.y, r: 10, hp: 3, speed: 0, cd: 10, side: 1, dead: false });
      update(0.2);
      expect(world.enemies[0].hp).toBe(2);

      world.enemyShots.push({ x: 7.5 * T, y: world.p.y, vx: -160, vy: 0, life: 2 });
      const hp = world.p.hp;
      updateHazards(0.5);
      expect(world.p.hp).toBeLessThan(hp);
      expect(world.enemyShots).toHaveLength(0);
      world.grid[5][6] = "#";
      world.enemyShots.push({ x: 7.5 * T, y: world.p.y, vx: -160, vy: 0, life: 2 });
      const after = world.p.hp;
      updateHazards(0.5);
      expect(world.p.hp).toBe(after);
      expect(world.enemyShots).toHaveLength(0);
    } finally {
      settings.startDepth = previousDepth;
    }
  });

  it("reduces both horde and lobber spawner delays by 55 percent", () => {
    const previousDepth = settings.startDepth;
    const random = vi.spyOn(Math, "random").mockReturnValue(0.5);
    try {
      settings.startDepth = 46;
      const world = newFloor();
      world.grid = Array.from({ length: world.rows }, () => Array<string>(world.cols).fill("."));
      world.genAt.clear(); world.pickups = []; world.enemies = []; world.exit = null;
      world.p.x = 5.5 * T; world.p.y = 5.5 * T;
      const generators = world.gens.slice();
      for (const kind of ["horde", "lobber"] as const) {
        const gen = generators.find((g) => g.kind === kind)!;
        gen.x = 8.5 * T; gen.y = 5.5 * T; gen.tx = 8; gen.ty = 5;
        world.gens = [gen]; gen.t = 0;
        update(0.01);
        const desertDelay = gen.t;
        world.area = AREAS[0]; gen.t = 0; world.enemies = [];
        update(0.01);
        expect(desertDelay).toBeCloseTo(gen.t * 0.45);
        world.area = AREAS[9];
      }
    } finally {
      random.mockRestore();
      settings.startDepth = previousDepth;
    }
  });

  it("spawns depth-scaled archers that shoot across quicksand but not walls", () => {
    const previousDepth = settings.startDepth;
    try {
      settings.startDepth = 46;
      const world = newFloor();
      world.grid = Array.from({ length: world.rows }, () => Array<string>(world.cols).fill("."));
      world.genAt.clear(); world.enemies = [];
      const g = world.gens.find((gen) => gen.kind === "horde")!;
      g.tx = 8; g.ty = 8; g.n = 2;
      spawnFrom(g);
      const archer = world.enemies[0];
      expect(archer.type).toBe("archer");
      expect(archer.hp).toBeCloseTo(16.5);
      archer.x = 8.5 * T; archer.y = 5.5 * T; archer.throwCd = 0; archer.speed = 0;
      world.p.x = 5.5 * T; world.p.y = 5.5 * T;
      world.grid[5][7] = "Q";
      updateEnemies(0.01);
      expect(world.enemyShots).toHaveLength(1);
      world.enemyShots = []; archer.throwCd = 0; world.grid[5][7] = "#";
      updateEnemies(0.01);
      expect(world.enemyShots).toHaveLength(0);
    } finally {
      settings.startDepth = previousDepth;
    }
  });
});
