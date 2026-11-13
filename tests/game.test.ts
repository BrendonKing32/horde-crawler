import { afterEach, describe, expect, it, vi } from "vitest";
import { blast, hitCoffin, hitGen, spawnFrom, usePotion } from "../src/game/actions";
import { AREAS, T } from "../src/game/constants";
import { updateEnemies } from "../src/game/enemies";
import { updateHazards } from "../src/game/hazards";
import { input } from "../src/game/input";
import { eligibleUpgrades, UPGRADES } from "../src/game/progression";
import type { Enemy } from "../src/game/types";
import { update } from "../src/game/update";
import { blocked } from "../src/game/world";
import { newFloor, settings } from "../src/game/state";

vi.mock("../src/game/narrator", () => ({ say: vi.fn(), sayOnce: vi.fn(), pop: vi.fn(), tickNarrator: vi.fn() }));

afterEach(() => {
  input.keys.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function enemy(x: number, y: number, type: Enemy["type"] = "biter"): Enemy {
  return { type, x, y, r: 6, hp: type === "reaper" ? Infinity : 100, speed: 0, cd: 10, side: 1, dead: false };
}

function combatFloor(depth: number) {
  const previousDepth = settings.startDepth;
  settings.startDepth = depth;
  try {
    const world = newFloor();
    world.grid = Array.from({ length: world.rows }, () => Array<string>(world.cols).fill("."));
    world.genAt.clear(); world.coffinAt.clear(); world.coffins = [];
    world.enemies = []; world.pickups = []; world.levers = []; world.exit = null;
    world.traps = []; world.pools.clear(); world.spores.clear(); world.conveyors.clear();
    world.area = AREAS[0];
    world.p.x = 5.5 * T; world.p.y = 5.5 * T;
    return world;
  } finally {
    settings.startDepth = previousDepth;
  }
}

describe("mob difficulty scaling", () => {
  it.each([[1, 1, 1], [11, 2, 1.5], [51, 6, 3.5]])(
    "scales spawned health and attack damage on floor %i",
    (depth, healthScale, damageScale) => {
      const world = combatFloor(depth);
      vi.spyOn(Math, "random").mockReturnValue(0.5);
      const template = world.gens[0];
      for (const [kind, n, tier, hp] of [
        ["horde", 0, 1, 1], ["horde", 0, 3, 3],
        ["horde", 2, 1, 1], ["lobber", 0, 2, 2],
      ] as const) {
        world.enemies = [];
        spawnFrom({ ...template, kind, n, tier, tx: 8, ty: 8 });
        expect(world.enemies).toHaveLength(n === 2 ? 3 : 1);
        for (const e of world.enemies) expect(e.hp).toBeCloseTo(hp * healthScale);
      }

      for (const [type, base] of [["grunt", 8], ["biter", 3], ["boss", 12], ["reaper", 15]] as const) {
        const e = { ...enemy(world.p.x, world.p.y, type), cd: 0 };
        world.enemies = [e];
        const hp = world.p.hp;
        updateEnemies(0.01);
        expect(hp - world.p.hp).toBeCloseTo(base * damageScale * (type === "reaper" ? 1 : world.p.st.armor));
        if (type === "reaper") {
          expect(e.hp).toBe(Infinity);
          expect(e.fed).toBeCloseTo(base * damageScale);
        }
      }
      world.area = AREAS[4];
      world.enemies = [{ ...enemy(world.p.x, world.p.y), cd: 0 }];
      const hp = world.p.hp;
      updateEnemies(0.01);
      expect(hp - world.p.hp).toBeCloseTo(3 * damageScale * world.p.st.armor);

      world.area = AREAS[0];
      world.enemies = [];
      const { x, y } = world.p;
      world.enemyShots = [{ x, y, vx: 0, vy: 0, life: 1 }];
      world.bombs = [{ sx: x, sy: y, tx: x, ty: y, t: 1, dur: 1 }];
      world.balloons = [{ x, y, vx: 0, vy: 0, t: 1, c: "red" }];
      const beforeRanged = world.p.hp;
      updateHazards(0.01);
      expect(beforeRanged - world.p.hp).toBeCloseTo((14 + 28 + 15) * damageScale * world.p.st.armor);
    },
  );

  it("blocks scaled bombs with Blast shield but still takes scaled arrow damage", () => {
    const world = combatFloor(51);
    const { x, y } = world.p;
    world.p.ups.blastShield = 1;
    world.bombs = [{ sx: x, sy: y, tx: x, ty: y, t: 1, dur: 1 }];
    const hp = world.p.hp;
    updateHazards(0.01);
    expect(world.p.hp).toBe(hp);
    expect(world.bombs).toHaveLength(0);
    world.enemyShots = [{ x, y, vx: 0, vy: 0, life: 1 }];
    updateHazards(0.01);
    expect(hp - world.p.hp).toBeCloseTo(14 * 3.5 * world.p.st.armor);
  });

  it("scales coffin and resurrected grunts in later area cycles", () => {
    const world = combatFloor(51);
    const { x, y } = world.p;
    vi.spyOn(Math, "random").mockReturnValue(0.9);
    hitCoffin({ x: x + 3 * T, y, tx: 8, ty: 5, hp: 3, alive: true, hit: 0 }, 3);
    expect(world.enemies[0].hp).toBeCloseTo(12);
    world.bones = [{ x: x + 3 * T, y, t: 0 }];
    updateHazards(0.01);
    expect(world.enemies[1].risen).toBe(true);
    expect(world.enemies[1].hp).toBeCloseTo(6);
  });

  it("makes later grunts survive shots that kill floor-one grunts", () => {
    const world = combatFloor(11);
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    spawnFrom({ ...world.gens[0], kind: "horde", n: 0, tier: 2, tx: 8, ty: 8 });
    const target = world.enemies[0];
    target.speed = 0; target.cd = 10;
    world.gens = [];
    const shot = () => world.shots.push({ x: target.x, y: target.y, vx: 0, vy: 0, life: 1, dmg: 2, pierce: 0, hits: new Set() });
    shot();
    update(0);
    expect(target.hp).toBeCloseTo(2);
    expect(target.dead).toBe(false);
    shot();
    update(0);
    expect(target.dead).toBe(true);
  });

  it("leaves environmental damage unchanged on deep floors", () => {
    const world = combatFloor(51);
    world.gens = [];
    const { x, y } = world.p;
    world.traps = [{ x, y, tx: 5, ty: 5, ph: 0, hitE: new Set() }];
    world.clouds = [{ x, y, r: 30, t: 2, seed: 0 }];
    world.pools.add(5 * world.cols + 5);
    const hp = world.p.hp;
    updateHazards(0.5);
    expect(hp - world.p.hp).toBeCloseTo(12 * world.p.st.armor + 3 + 1);
  });
});

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
      expect(bosses[0].hp).toBeCloseTo(126);
      expect(bosses[0].maxHp).toBe(bosses[0].hp);

      settings.startDepth = 55;
      const laterBoss = newFloor().enemies.find((enemy) => enemy.type === "boss")!;
      expect(laterBoss.hp).toBeCloseTo(576);
      expect(laterBoss.maxHp).toBe(laterBoss.hp);

      settings.startDepth = 6;
      const regularFloor = newFloor();
      expect(regularFloor.bossFloor).toBe(false);
      expect(regularFloor.enemies.some((enemy) => enemy.type === "boss")).toBe(false);
    } finally {
      settings.startDepth = previousDepth;
    }
  });

  describe("build-changing upgrades", () => {
    function emptyWorld() {
      const world = newFloor();
      world.grid = Array.from({ length: world.rows }, () => Array<string>(world.cols).fill("."));
      world.genAt.clear(); world.gens = []; world.coffinAt.clear(); world.coffins = [];
      world.pickups = []; world.enemies = []; world.levers = []; world.exit = null;
      world.p.x = 5.5 * T; world.p.y = 5.5 * T;
      return world;
    }

    it("offers mutually exclusive shot styles and preserves the choice across floors", () => {
      const world = emptyWorld();
      expect(eligibleUpgrades(world.p).map((u) => u.id)).toEqual(expect.arrayContaining(["explosive", "ricochet"]));
      world.p.ups.explosive = 1;
      expect(eligibleUpgrades(world.p).some((u) => u.id === "ricochet" || u.id === "pierce")).toBe(false);
      const p = world.p;
      const next = newFloor({ depth: 2, hp: p.hp, potions: p.potions, score: p.score, time: 0, kills: 0, smashed: 0, st: p.st, level: p.level, xp: p.xp, ups: p.ups, pending: 0 });
      expect(next.p.ups.explosive).toBe(1);
      expect(eligibleUpgrades(next.p).some((u) => u.id === "ricochet")).toBe(false);
      next.p.ups = { ricochet: 1 };
      expect(eligibleUpgrades(next.p).some((u) => u.id === "explosive")).toBe(false);
    });

    it("applies the shot-style tradeoffs when firing", () => {
      const world = emptyWorld(), p = world.p;
      const explosive = UPGRADES.find((u) => u.id === "explosive")!;
      const baseCd = p.st.cd;
      p.ups.explosive = 1; explosive.apply(p.st, p);
      input.keys.add(" ");
      update(0.01);
      expect(p.cd).toBeCloseTo(baseCd * 1.35);
      expect(world.shots[0].style).toBe("explosive");
      world.shots = []; p.ups = { ricochet: 1 }; p.cd = 0;
      update(0.01);
      expect(world.shots[0].style).toBe("ricochet");
      expect(world.shots[0].dmg).toBe(p.st.dmg * 0.75);
    });

    it("explodes once, damages nearby enemies and food, but not reapers or burrowed enemies", () => {
      const world = emptyWorld();
      const x = 400, y = 400;
      world.enemies = [enemy(x, y), enemy(x + 40, y), enemy(x + 100, y), enemy(x + 20, y, "reaper"), { ...enemy(x + 10, y), under: true }];
      world.pickups = [{ type: "F", x: x + 20, y, alive: true }, { type: "F", x: x + 80, y, alive: true }];
      world.shots = [{ x, y, vx: 0, vy: 0, life: 1, dmg: 4, pierce: 2, hits: new Set(), style: "explosive" }];
      update(0.01);
      expect(world.enemies.map((e) => e.hp)).toEqual([96, 96, 100, Infinity, 100]);
      expect(world.pickups.map((p) => p.alive)).toEqual([false, true]);
      expect(world.shots).toHaveLength(0);
    });

    it("reflects a ricochet shot once off a wall", () => {
      const world = emptyWorld();
      world.grid[8][9] = "#";
      world.shots = [{ x: 8.5 * T, y: 8.5 * T, vx: 160, vy: 0, life: 2, dmg: 1, pierce: 0, hits: new Set(), style: "ricochet", bounces: 1 }];
      update(0.2);
      expect(world.shots).toHaveLength(1);
      expect(world.shots[0].vx).toBe(-160);
      expect(world.shots[0].bounces).toBe(0);
      expect(world.shots[0].x).toBeLessThan(9 * T);
      world.grid[8][7] = "#";
      update(0.2);
      expect(world.shots).toHaveLength(0);
    });

    it("detects fast shots hitting enemies and ricochets hitting enemies on their return", () => {
      const world = emptyWorld(), y = 8.5 * T;
      world.enemies = [enemy(8 * T, y)];
      world.shots = [{ x: 7.5 * T, y, vx: 580, vy: 0, life: 1, dmg: 4, pierce: 0, hits: new Set(), style: "explosive" }];
      update(0.05);
      expect(world.enemies[0].hp).toBe(96);
      world.enemies = [enemy(7.5 * T, y)];
      world.grid[8][9] = "#";
      world.shots = [{ x: 8.5 * T, y, vx: 320, vy: 0, life: 1, dmg: 3, pierce: 0, hits: new Set(), style: "ricochet", bounces: 1 }];
      update(0.2);
      expect(world.enemies[0].hp).toBe(97);
      expect(world.shots).toHaveLength(0);
    });

    it("does not destroy food spawned by the spawner an explosive shot just broke", () => {
      const world = emptyWorld();
      const g = { tx: 9, ty: 8, x: 9.5 * T, y: 8.5 * T, kind: "horde" as const, tier: 1, hp: 1, max: 1, t: 10, alive: true, hit: 0, n: 0 };
      world.gens = [g]; world.genAt.set(g.ty * world.cols + g.tx, g);
      world.p.ups.scavenger = 1;
      vi.spyOn(Math, "random").mockReturnValue(0.1);
      world.shots = [{ x: 8.5 * T, y: g.y, vx: 160, vy: 0, life: 1, dmg: 2, pierce: 0, hits: new Set(), style: "explosive" }];
      update(0.2);
      expect(g.alive).toBe(false);
      expect(world.pickups.some((k) => k.type === "F" && k.alive)).toBe(true);
    });

    it("protects only against the specified hazards while health drain remains", () => {
      const world = emptyWorld(), p = world.p, { x, y } = p;
      world.area = AREAS[1]; world.rockT = 100;
      world.p.ups = { surefooted: 1, antitoxin: 1, blastShield: 1 };
      world.pools.add(Math.floor(y / T) * world.cols + Math.floor(x / T));
      world.clouds = [{ x, y, t: 5, r: 40, seed: 0 }];
      world.traps = [{ x, y, tx: 5, ty: 5, hitE: new Set() }, { x, y, tx: 5, ty: 5, kind: "press", hitE: new Set() }];
      world.bombs = [{ sx: x, sy: y, tx: x, ty: y, t: 1, dur: 1 }];
      world.rocks = [{ x, y, t: 1, dur: 1 }];
      const hp = p.hp;
      updateHazards(0.5);
      expect(p.hp).toBe(hp);
      expect(p.slowF).toBe(1);
      world.enemyShots = [{ x, y, vx: 0, vy: 0, life: 1 }];
      updateHazards(0.01);
      expect(p.hp).toBeLessThan(hp);
      world.enemyShots = [];
      const beforeDrain = p.hp;
      update(1);
      expect(p.hp).toBe(beforeDrain - 1);
    });

    it("trades spawner XP for a chance of food and recharges ability only on potion use", () => {
      vi.stubGlobal("matchMedia", () => ({ matches: false }));
      const world = newFloor(), p = world.p, g = world.gens[0];
      vi.spyOn(Math, "random").mockReturnValue(0.1);
      p.ups.scavenger = 1; g.hp = 1;
      hitGen(g, 1);
      expect(p.xp).toBe(0);
      expect(world.pickups.some((k) => k.type === "F" && k.x === g.x && k.y === g.y)).toBe(true);
      world.coffins = []; world.gens = [];
      world.enemies = [enemy(p.x + 224, p.y, "reaper"), enemy(p.x + 225, p.y, "reaper")];
      p.ups.alchemist = 1; p.abilityCd = 4;
      usePotion();
      expect(p.abilityCd).toBe(0);
      expect(world.enemies.map((e) => e.dead)).toEqual([true, false]);
      p.abilityCd = 4; p.potions = 0;
      usePotion();
      expect(p.abilityCd).toBe(4);
    });
  });
});
