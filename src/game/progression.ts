import { $ } from "./dom";
import { input, releaseTouch } from "./input";
import { say } from "./narrator";
import { S } from "./state";
import type { Player, PlayerStats } from "./types";

/** XP needed to go from level l to l+1. */
export const xpNeed = (l: number) => 30 + l * 25;

export function gainXp(n: number) {
  const p = S.p;
  p.xp += n;
  while (p.xp >= xpNeed(p.level)) { p.xp -= xpNeed(p.level); p.level++; S.pending++; }
}

export interface Upgrade {
  id: string;
  name: string;
  desc: string;
  max: number;
  apply: (s: PlayerStats, p: Player) => void;
  weight?: number;
  excludes?: string;
}

/** Per-run upgrades offered three at a time on level up. max 99 = repeatable. */
export const UPGRADES: Upgrade[] = [
  { id: "rate", name: "Quick hands", desc: "Fire 15% faster.", max: 5, apply: (s) => { s.cd *= 0.85; } },
  { id: "dmg", name: "Heavy shots", desc: "Shots deal 1 more damage.", max: 3, apply: (s) => { s.dmg++; } },
  { id: "spd", name: "Fleet feet", desc: "Move 10% faster.", max: 4, apply: (s) => { s.speed *= 1.1; } },
  { id: "arm", name: "Thick hide", desc: "Take 15% less damage from monsters.", max: 4, apply: (s) => { s.armor *= 0.85; } },
  { id: "split", name: "Split shot", desc: "Fire two extra shots in a spread.", max: 2, apply: (s) => { s.split++; } },
  { id: "pierce", name: "Piercing", desc: "Shots pass through one more enemy.", max: 2, apply: (s) => { s.pierce++; } },
  { id: "explosive", name: "Explosive shots", desc: "Shots explode on impact, damaging nearby enemies and food. Fire 35% slower; shots no longer pierce. Excludes Ricochet.", max: 1, excludes: "ricochet", apply: (s) => { s.cd *= 1.35; } },
  { id: "ricochet", name: "Ricochet", desc: "Shots bounce once off walls, but deal 25% less damage. Excludes Explosive shots.", max: 1, excludes: "explosive", apply: () => {} },
  { id: "range", name: "Long reach", desc: "Shots fly 25% farther.", max: 3, apply: (s) => { s.life *= 1.25; } },
  { id: "food", name: "Hearty eater", desc: "Food heals 40 more.", max: 3, apply: (s) => { s.food += 40; } },
  { id: "slow", name: "Slow burn", desc: "Health drains 20% slower.", max: 3, apply: (s) => { s.drain *= 0.8; } },
  { id: "surefooted", name: "Surefooted", desc: "Immune to spikes and crushing presses.", max: 1, weight: 0.4, apply: () => {} },
  { id: "antitoxin", name: "Antitoxin", desc: "Immune to poison clouds and bile pools, including their slowing effects.", max: 1, weight: 0.4, apply: () => {} },
  { id: "blastShield", name: "Blast shield", desc: "Immune to lobber bombs and falling rocks.", max: 1, weight: 0.4, apply: () => {} },
  { id: "scavenger", name: "Scavenger", desc: "Destroyed spawners sometimes drop food, but no longer grant their 10 XP bonus.", max: 1, apply: () => {} },
  { id: "alchemist", name: "Potion alchemist", desc: "Using a potion recharges your ability, but its blast radius is 25% smaller.", max: 1, apply: () => {} },
  { id: "pot", name: "Deep pockets", desc: "Gain a potion now.", max: 99, apply: (_s, p) => { p.potions = Math.min(9, p.potions + 1); } },
  { id: "heal", name: "Second wind", desc: "Restore 150 health now.", max: 99, apply: (_s, p) => { p.hp = Math.min(999, p.hp + 150); } },
];

let offer: Upgrade[] = [];

export function eligibleUpgrades(p: Player): Upgrade[] {
  return UPGRADES.filter((u) => (p.ups[u.id] || 0) < u.max &&
    !(u.excludes && p.ups[u.excludes]) &&
    !(u.id === "pierce" && p.ups.explosive) &&
    !(u.id === "pot" && p.potions >= 9));
}

/** Pause and offer three random upgrades that aren't maxed out. */
export function openLevelUp() {
  const p = S.p;
  S.pending--;
  S.state = "levelup";
  input.keys.clear();
  releaseTouch();
  const pool = eligibleUpgrades(p);
  offer = [];
  while (pool.length && offer.length < 3) {
    let roll = Math.random() * pool.reduce((sum, u) => sum + (u.weight ?? 1), 0);
    let index = 0;
    while (index < pool.length - 1 && (roll -= pool[index].weight ?? 1) >= 0) index++;
    offer.push(pool.splice(index, 1)[0]);
  }
  $("lvTag").textContent = `Level ${p.level - S.pending}`;
  const box = $("ups");
  box.innerHTML = "";
  offer.forEach((u, i) => {
    const b = document.createElement("button"), r = p.ups[u.id] || 0;
    b.type = "button";
    b.className = "cls";
    b.style.setProperty("--c", "var(--torch)");
    const name = document.createElement("b"), desc = document.createElement("span");
    name.textContent = u.name;
    desc.textContent = `${u.desc}${u.max < 99 ? ` Rank ${r + 1} of ${u.max}.` : ""} Press ${i + 1}.`;
    b.append(name, desc);
    b.addEventListener("click", () => chooseUpgrade(i));
    box.appendChild(b);
  });
  $("ovLvl").hidden = false;
  (box.firstChild as HTMLElement | null)?.focus();
}

export function chooseUpgrade(i: number) {
  const u = offer[i];
  if (!u || S.state !== "levelup") return;
  const p = S.p;
  p.ups[u.id] = (p.ups[u.id] || 0) + 1;
  u.apply(p.st, p);
  offer = [];
  $("ovLvl").hidden = true;
  S.state = "play";
  say(`${u.name}.`);
}
