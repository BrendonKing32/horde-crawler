import { describe, expect, it } from "vitest";
import { T } from "../src/game/constants";
import { blackoutRadii } from "../src/game/lighting";

describe("carnival blackout", () => {
  it("limits visibility to three world tiles at full health across zoom levels", () => {
    for (const zoom of [0.68, 1, 1.5]) {
      const { inner, outer } = blackoutRadii(zoom, 1);
      expect(inner / zoom).toBeCloseTo(1.1 * T);
      expect(outer / zoom).toBeCloseTo(3 * T);
    }
  });

  it("shrinks with health and clamps to the supported range", () => {
    expect(blackoutRadii(1, 0).outer).toBeCloseTo(2.2 * T);
    expect(blackoutRadii(1, -1)).toEqual(blackoutRadii(1, 0));
    expect(blackoutRadii(1, 2)).toEqual(blackoutRadii(1, 1));
  });
});
