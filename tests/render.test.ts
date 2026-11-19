import { afterEach, describe, expect, it, vi } from "vitest";
import { AREAS, T } from "../src/game/constants";
import { initCanvas, render } from "../src/game/render";
import { newFloor } from "../src/game/state";
import type { Enemy } from "../src/game/types";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function scene() {
  vi.stubGlobal("devicePixelRatio", 1);
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  vi.stubGlobal("ResizeObserver", class { observe() {} });
  const ctx = {
    setTransform: vi.fn(), fillRect: vi.fn(), strokeRect: vi.fn(),
    beginPath: vi.fn(), arc: vi.fn(), ellipse: vi.fn(), fill: vi.fn(), stroke: vi.fn(),
    moveTo: vi.fn(), lineTo: vi.fn(), quadraticCurveTo: vi.fn(), closePath: vi.fn(),
    fillText: vi.fn(), createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  };
  const canvas = {
    width: 0, height: 0, getContext: () => ctx,
    getBoundingClientRect: () => ({ width: 320, height: 240 }),
  } as unknown as HTMLCanvasElement;
  const world = newFloor();
  world.area = AREAS[0];
  world.grid = Array.from({ length: world.rows }, () => Array<string>(world.cols).fill("."));
  world.p.x = world.mw / 2; world.p.y = world.mh / 2;
  world.exit = null; world.pickups = []; world.traps = []; world.bones = [];
  world.coffins = []; world.levers = []; world.gens = []; world.enemies = [];
  world.pools.clear(); world.conveyors.clear(); world.spores.clear(); world.tentFloor.clear();
  initCanvas(canvas);
  render();
  return { ctx, world, cam: world.cam! };
}

function boss(x: number, y: number): Enemy {
  return { type: "boss", x, y, r: 17, hp: 100, maxHp: 100, speed: 0, cd: 10, side: 1, dead: false };
}

describe("viewport rendering", () => {
  it("does not issue drawing operations for offscreen enemies and floor objects", () => {
    const { ctx, world, cam } = scene();
    const operations = [ctx.fillRect, ctx.strokeRect, ctx.arc, ctx.ellipse, ctx.moveTo, ctx.lineTo, ctx.fillText];
    const counts = () => operations.map((operation) => operation.mock.calls.length);
    const baseline = counts();
    operations.forEach((operation) => operation.mockClear());

    const x = cam.x - 2 * T, y = cam.y + cam.h / 2, tx = Math.floor(x / T), ty = Math.floor(y / T);
    world.exit = { x, y };
    world.pickups = [{ type: "F", x, y, alive: true }];
    world.traps = [{ x, y, tx, ty, kind: "press", hitE: new Set() }];
    world.bones = [{ x, y, t: 1 }];
    world.coffins = [{ x, y, tx, ty, hp: 3, alive: true, hit: 0 }];
    world.levers = [{ x, y, id: 0, on: false }];
    world.gens = [{ x, y, tx, ty, kind: "horde", tier: 1, hp: 3, max: 3, t: 1, alive: true, hit: 0, n: 0 }];
    world.enemies = [boss(x, y)];
    render();

    expect(counts()).toEqual(baseline);
    expect(world.enemies).toHaveLength(1);
    expect(world.pickups[0].alive).toBe(true);
  });

  it("draws sprites that overlap the viewport even when their centers are outside it", () => {
    const { ctx, world, cam } = scene();
    const x = cam.x - 25, y = cam.y + cam.h / 2;
    world.enemies = [boss(x, y)];
    world.pickups = [{ type: "F", x: cam.x - 4, y, alive: true }];
    ctx.arc.mockClear();
    ctx.ellipse.mockClear();
    render();

    expect(ctx.arc).toHaveBeenCalledWith(x, y, 17, 0, 7);
    expect(ctx.ellipse).toHaveBeenCalledWith(cam.x - 6, y, 8, 6, -0.5, 0, 7);
  });
});
