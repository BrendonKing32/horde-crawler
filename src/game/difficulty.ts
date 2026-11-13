/** Linear growth from floor-one stats; never resets when the area cycle repeats. */
export const mobHealth = (base: number, depth: number) => base * (1 + (depth - 1) * 0.1);
export const mobDamage = (base: number, depth: number) => base * (1 + (depth - 1) * 0.05);
