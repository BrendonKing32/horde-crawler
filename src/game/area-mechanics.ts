import { T } from "./constants";

/** The archive floods for half of each twelve-second cycle. */
export const highTide = (time: number) => time % 12 >= 6;

/** A rotating, narrow ray originating at the centre of the floor. */
export function inAstralBeam(x: number, y: number, width: number, height: number, time: number) {
  const dx = x - width / 2, dy = y - height / 2;
  const angle = time * 0.35;
  const along = dx * Math.cos(angle) + dy * Math.sin(angle);
  const across = Math.abs(-dx * Math.sin(angle) + dy * Math.cos(angle));
  return along >= 0 && across <= T * 0.75;
}
