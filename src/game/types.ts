import type { AreaTheme, ClassStats } from "./constants";

export interface Vec { x: number; y: number }

/** Live player stats: class stats plus upgrade-only fields. Upgrades mutate this copy. */
export interface PlayerStats extends ClassStats {
  /** Health restored per food. */
  food: number;
  /** Multiplier on the per-second health drain. */
  drain: number;
  /** Extra shots on each side of the spread. */
  split: number;
  /** Enemies a shot passes through. */
  pierce: number;
}

export interface Player extends Vec {
  r: number;
  hp: number;
  maxHp: number;
  cls: ClassStats;
  st: PlayerStats;
  face: Vec;
  cd: number;
  keys: number;
  potions: number;
  score: number;
  level: number;
  xp: number;
  ups: Record<string, number>;
  /** Red edge-glow intensity, 0..1. */
  hurt: number;
  /** White flash timer for big hits. */
  blink: number;
  /** Movement multiplier from clouds/pools this frame. */
  slowF: number;
  cloudT: number;
  poolT: number;
  abilityCd: number;
  guardT: number;
  dashT: number;
}

export type EnemyType = "grunt" | "biter" | "lobber" | "reaper" | "boss" | "archer";
export type BiterMode = "wander" | "chase" | "scatter";

export interface Enemy extends Vec {
  type: EnemyType;
  r: number;
  hp: number;
  speed: number;
  cd: number;
  side: number;
  dead: boolean;
  hit?: number;
  den?: Spawner;
  /** Crypt: already rose once. */
  risen?: boolean;
  // biter
  mode?: BiterMode;
  mt?: number;
  hd?: number;
  /** Caverns: burrowed. */
  under?: boolean;
  bt?: number;
  // lobber
  throwCd?: number;
  wind?: number;
  // reaper
  awake?: boolean;
  fed?: number;
  ping?: number;
  inWall?: boolean;
  maxHp?: number;
  chargeCd?: number;
  chargeWind?: number;
  chargeT?: number;
  chargeX?: number;
  chargeY?: number;
  sporeCd?: number;
}

export interface Spawner extends Vec {
  tx: number; ty: number;
  kind: "horde" | "lobber";
  tier: number;
  hp: number; max: number;
  t: number;
  alive: boolean;
  hit: number;
  /** Spawn counter (every third horde spawn is a biter pack). */
  n: number;
}

export type PickupType = "F" | "O" | "K" | "$";
export interface Pickup extends Vec { type: PickupType; alive: boolean }
export interface Lever extends Vec { id: number; on: boolean }
export interface Coffin extends Vec { tx: number; ty: number; hp: number; alive: boolean; hit: number }
export interface Trap extends Vec {
  tx: number; ty: number;
  kind?: "press";
  /** Phase offset shared by a connected strip. */
  ph?: number;
  up?: boolean; warn?: boolean;
  lastId?: number;
  hitP?: boolean;
  hitE: Set<Enemy>;
}

export interface Shot extends Vec { vx: number; vy: number; life: number; dmg: number; pierce: number; hits: Set<Enemy>; dead?: boolean }
export interface EnemyShot extends Vec { vx: number; vy: number; life: number }
export interface Bomb { sx: number; sy: number; tx: number; ty: number; t: number; dur: number; dead?: boolean }
export interface Balloon extends Vec { vx: number; vy: number; t: number; c: string; dead?: boolean }
export interface Cloud extends Vec { t: number; r: number; seed: number }
export interface Rock extends Vec { t: number; dur: number; dead?: boolean }
export interface Bones extends Vec { t: number; dead?: boolean }
export interface Pop extends Vec { text: string; color: string; t: number }
export interface Boom extends Vec { t: number }
export interface GateOpening { tx: number; ty: number; id: number; t: number }
export interface Camera { x: number; y: number; w: number; h: number }

export type GameState = "ready" | "play" | "levelup" | "bossclear" | "over";

/** Everything carried between floors of one run. */
export interface Carry {
  depth: number;
  hp: number;
  potions: number;
  score: number;
  time: number;
  kills: number;
  smashed: number;
  st: PlayerStats;
  level: number;
  xp: number;
  ups: Record<string, number>;
  pending: number;
}

export interface World {
  depth: number;
  area: AreaTheme;
  cols: number; rows: number;
  /** World size in pixels. */
  mw: number; mh: number;
  grid: string[][];
  p: Player;
  enemies: Enemy[];
  gens: Spawner[];
  genAt: Map<number, Spawner>;
  pickups: Pickup[];
  levers: Lever[];
  coffins: Coffin[];
  coffinAt: Map<number, Coffin>;
  traps: Trap[];
  pools: Set<number>;
  conveyors: Set<number>;
  spores: Set<number>;
  hidden: Set<number>;
  tentWall: Set<number>;
  tentFloor: Set<number>;
  exit: Vec | null;
  shots: Shot[];
  enemyShots: EnemyShot[];
  bombs: Bomb[];
  balloons: Balloon[];
  clouds: Cloud[];
  rocks: Rock[];
  bones: Bones[];
  pops: Pop[];
  booms: Boom[];
  opening: GateOpening[];
  cam: Camera | null;
  state: GameState;
  time: number;
  /** Fractional drain accumulator. */
  drain: number;
  flash: number;
  kills: number;
  smashed: number;
  pending: number;
  /** Narrator lines already spoken this floor. */
  said: Record<string, boolean>;
  lockSay: number;
  reaperTip: number;
  rockT: number;
  shelfT: number;
  lightsT: number;
  dark: boolean;
  flick: boolean;
  bossFloor: boolean;
  bossDefeated: boolean;
}
