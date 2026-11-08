import { $ } from "./dom";
import { S } from "./state";

let sayT = 0;

/** Show a narrator line at the top of the stage for a couple of seconds. */
export function say(text: string) {
  const el = $("say");
  el.textContent = text;
  el.classList.add("on");
  sayT = 2.4;
}

/** Say a line only the first time `key` comes up on this floor. */
export function sayOnce(key: string, text: string) {
  if (S.said[key]) return;
  S.said[key] = true;
  say(text);
}

export function tickNarrator(dt: number) {
  if (sayT > 0) { sayT -= dt; if (sayT <= 0) $("say").classList.remove("on"); }
}

/** Floating text in world space. */
export function pop(x: number, y: number, text: string, color: string) {
  S.pops.push({ x, y, text, color, t: 0.9 });
}
