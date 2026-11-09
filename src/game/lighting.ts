import { T } from "./constants";

/** Screen-space radii for the carnival blackout, bounded in world tiles. */
export function blackoutRadii(zoom: number, healthFraction: number) {
  const health = Math.min(1, Math.max(0, healthFraction));
  return {
    inner: T * zoom * (0.6 + 0.5 * health),
    outer: T * zoom * (2.2 + 0.8 * health),
  };
}
