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
}

/** Per-run upgrades offered three at a time on level up. max 99 = repeatable. */
export const UPGRADES: Upgrade[] = [
  { id: "rate", name: "Quick hands", desc: "Fire 15% faster.", max: 5, apply: (s) => { s.cd *= 0.85; } },
  { id: "dmg", name: "Heavy shots", desc: "Shots deal 1 more damage.", max: 3, apply: (s) => { s.dmg++; } },
  { id: "spd", name: "Fleet feet", desc: "Move 10% faster.", max: 4, apply: (s) => { s.speed *= 1.1; } },
  { id: "arm", name: "Thick hide", desc: "Take 15% less damage from monsters.", max: 4, apply: (s) => { s.armor *= 0.85; } },
  { id: "split", name: "Split shot", desc: "Fire two extra shots in a spread.", max: 2, apply: (s) => { s.split++; } },
  { id: "pierce", name: "Piercing", desc: "Shots pass through one more enemy.", max: 2, apply: (s) => { s.pierce++; } },
  { id: "range", name: "Long reach", desc: "Shots fly 25% farther.", max: 3, apply: (s) => { s.life *= 1.25; } },
  { id: "food", name: "Hearty eater", desc: "Food heals 40 more.", max: 3, apply: (s) => { s.food += 40; } },
  { id: "slow", name: "Slow burn", desc: "Health drains 20% slower.", max: 3, apply: (s) => { s.drain *= 0.8; } },
  { id: "pot", name: "Deep pockets", desc: "Gain a potion now.", max: 99, apply: (_s, p) => { p.potions = Math.min(9, p.potions + 1); } },
  { id: "heal", name: "Second wind", desc: "Restore 150 health now.", max: 99, apply: (_s, p) => { p.hp = Math.min(999, p.hp + 150); } },
];

let offer: Upgrade[] = [];

/** Pause and offer three random upgrades that aren't maxed out. */
export function openLevelUp() {
  const p = S.p;
  S.pending--;
  S.state = "levelup";
  input.keys.clear();
  releaseTouch();
  offer = UPGRADES.filter((u) => (p.ups[u.id] || 0) < u.max && !(u.id === "pot" && p.potions >= 9))
    .sort(() => Math.random() - 0.5)
    .slice(0, 3);
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
