import { describe, expect, it } from "vitest";
import { blocked } from "../src/game/world";
import { newFloor, settings } from "../src/game/state";

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
