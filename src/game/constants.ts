/** Tile size in world pixels. */
export const T = 32;

/** Palette. Mirrors the CSS custom properties in styles.css. */
export const C = {
  void: "#0b0d12", stone: "#161a23", stone2: "#1a1f2a", wall: "#363f53", wallHi: "#56617a", edge: "#262c3a",
  torch: "#f2a541", blood: "#d6435b", wisp: "#c9b6ff", rose: "#e58fd0", biter: "#b9d36a", ranger: "#62d2c2",
  mana: "#5aa9ff", life: "#7fd18b", gold: "#e8c45a", ink: "#ece6d8", dim: "#8b90a1",
} as const;
export type ColorName = keyof typeof C;

export const DISPLAY_FONT = '"Pixelify Sans","Courier New",monospace';

/** Gate/lever pair colours, indexed by gate number (a/x, b/y, c/z). */
export const PAIR = [C.mana, C.ranger, C.rose];
export const BULBS = [C.blood, C.gold, C.ranger, C.rose];
export const BALLOONS = ["#e0524f", "#f2c14e", "#5fc2d9", "#c98bdb"];

export type WallStyle = "brick" | "rock" | "bone" | "plague" | "carnival";

export interface AreaTheme {
  name: string;
  style: WallStyle;
  wall: string; hi: string;
  /** Checkerboard floor colours. */
  a: string; b: string;
  fleck: string;
  /** RGB triple for the darkness vignette. */
  shade: string;
  plague?: boolean;
  carnival?: boolean;
}

/** Indexed by AreaId from gen/generator.ts. */
export const AREAS: AreaTheme[] = [
  { name: "The Crypt", style: "brick", wall: C.wall, hi: C.wallHi, a: C.stone, b: C.stone2, fleck: C.dim, shade: "5,6,10" },
  { name: "The Caverns", style: "rock", wall: "#47392b", hi: "#6f5a40", a: "#1b1611", b: "#201a14", fleck: "#8a7a52", shade: "5,6,10" },
  { name: "The Catacombs", style: "bone", wall: "#2c4241", hi: "#4d6c67", a: "#111a19", b: "#152020", fleck: "#cfc6ad", shade: "5,6,10" },
  { name: "The Plague Ward", style: "plague", plague: true, wall: "#313d27", hi: "#566b3a", a: "#131810", b: "#171e12", fleck: "#9bbf4a", shade: "7,12,5" },
  { name: "The Carnival", style: "carnival", carnival: true, wall: "#33243f", hi: "#5a3d6b", a: "#18131d", b: "#1c1622", fleck: "#e8c45a", shade: "8,5,14" },
];

export type ClassId = "warden" | "ranger";

export interface ClassStats {
  hp: number;
  speed: number;
  /** Multiplier on monster damage taken (lower is tougher). */
  armor: number;
  dmg: number;
  /** Seconds between shots. */
  cd: number;
  shotSpeed: number;
  /** Shot lifetime in seconds (range = shotSpeed * life). */
  life: number;
  color: ColorName;
}

export const CLASSES: Record<ClassId, ClassStats> = {
  warden: { hp: 500, speed: 140, armor: 0.7, dmg: 2, cd: 0.22, shotSpeed: 420, life: 0.7, color: "torch" },
  ranger: { hp: 420, speed: 205, armor: 1.3, dmg: 1, cd: 0.11, shotSpeed: 580, life: 0.85, color: "ranger" },
};

/** Cheap deterministic per-tile hash for texture variation. */
export const hash = (x: number, y: number) => {
  let h = (x * 374761393 + y * 668265263) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return h ^ (h >>> 16);
};

export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
