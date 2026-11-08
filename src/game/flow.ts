import type { ClassId } from "./constants";
import { $, fmtTime } from "./dom";
import { releaseTouch } from "./input";
import { say } from "./narrator";
import { S, newFloor, settings } from "./state";

export function startRun() {
  newFloor();
  S.state = "play";
  $("ovStart").hidden = true;
  $("ovEnd").hidden = true;
  say(S.depth > 1 ? `Floor ${S.depth}: ${S.area.name}.` : "Health drains every second. Keep moving.");
}

/** Carry the run onto the next floor. Clearing a floor is worth 100 x floor number. */
export function nextFloor() {
  const p = S.p;
  p.score += 100 * S.depth;
  newFloor({
    depth: S.depth + 1, hp: p.hp, potions: p.potions, score: p.score, time: S.time,
    kills: S.kills, smashed: S.smashed, st: p.st, level: p.level, xp: p.xp, ups: p.ups, pending: S.pending,
  });
  S.state = "play";
  releaseTouch();
  say(S.depth % 5 === 1 ? `Floor ${S.depth}: ${S.area.name}.` : `Floor ${S.depth}. Deeper and hungrier.`);
}

export function endRun(won: boolean) {
  S.state = "over";
  releaseTouch();
  $("endTag").textContent = won ? "Floor cleared" : "Run over";
  $("endTitle").textContent = won ? "You made it out." : "You ran out of health.";
  $("rScore").textContent = String(S.p.score);
  $("rTime").textContent = fmtTime(S.time);
  $("rKills").textContent = String(S.kills);
  $("rGens").textContent = String(S.smashed);
  $("rFloor").textContent = String(S.depth);
  $("rLvl").textContent = String(S.p.level);
  $("ovEnd").hidden = false;
  $("goAgain").focus();
}

export function pickClass(c: ClassId) {
  settings.cls = c;
  document.querySelectorAll<HTMLElement>(".cls[data-cls]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.cls === c)));
}

/** Wire the start and end screens. */
export function bindScreens() {
  const chips = [...document.querySelectorAll<HTMLButtonElement>(".chip")];
  for (const b of chips) b.addEventListener("click", () => {
    settings.startDepth = Number(b.dataset.depth);
    chips.forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  });
  document.querySelectorAll<HTMLElement>(".cls[data-cls]").forEach((b) => b.addEventListener("click", () => pickClass(b.dataset.cls as ClassId)));
  $("goClass").addEventListener("click", () => { $("ovEnd").hidden = true; $("ovStart").hidden = false; $("goStart").focus(); });
  $("goStart").addEventListener("click", startRun);
  $("goAgain").addEventListener("click", startRun);
}
