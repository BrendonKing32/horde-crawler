import { $, fmtTime } from "./dom";
import { xpNeed } from "./progression";
import { S } from "./state";

const ids = ["lv", "xpb", "fl", "hpv", "hpb", "sc", "ky", "pt", "gn", "tm"] as const;
type HudId = (typeof ids)[number];
let el: Record<HudId, HTMLElement> | null = null;
const last: Record<string, string> = {};

/** Write only what changed, so the HUD doesn't thrash layout every frame. */
const set = (k: HudId, v: string) => { if (last[k] !== v) { last[k] = v; el![k].textContent = v; } };
const width = (k: HudId, pct: number, digits: number) => {
  const w = `${Math.min(100, pct).toFixed(digits)}%`;
  if (last[`${k}w`] !== w) { last[`${k}w`] = w; el![k].style.width = w; }
};

export function hud() {
  el ??= Object.fromEntries(ids.map((id) => [id, $(id)])) as Record<HudId, HTMLElement>;
  const p = S.p, hp = Math.max(0, Math.ceil(p.hp)), low = hp <= 150;
  set("hpv", String(hp));
  el.hpv.classList.toggle("low", low);
  width("hpb", (hp / p.maxHp) * 100, 1);
  el.hpb.classList.toggle("low", low);
  set("fl", String(S.depth));
  set("lv", String(p.level));
  width("xpb", (p.xp / xpNeed(p.level)) * 100, 0);
  set("sc", String(p.score));
  set("ky", String(p.keys));
  set("pt", String(p.potions));
  set("gn", String(S.gens.filter((g) => g.alive).length));
  set("tm", fmtTime(S.time));
}
