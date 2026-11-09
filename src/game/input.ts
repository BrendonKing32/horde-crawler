import { $ } from "./dom";
import { S } from "./state";
import type { Vec } from "./types";

export interface Joystick { id: number; ox: number; oy: number; x: number; y: number }

/** Current input. Keys are lower-cased KeyboardEvent.key values. */
export const input = {
  keys: new Set<string>(),
  potionReq: false,
  abilityReq: false,
  fireTouch: false,
  fireMouse: false,
  joy: null as Joystick | null,
  aimJoy: null as Joystick | null,
  aim: null as Vec | null,
  aimDirection: null as Vec | null,
};

export interface InputHooks {
  isPlaying: () => boolean;
  /** Return true if the key was consumed (e.g. picking an upgrade). */
  onKey: (key: string) => boolean;
}

/** Drop held touch input (used when overlays open). */
export function releaseTouch() {
  input.fireTouch = false;
  input.fireMouse = false;
  input.potionReq = false;
  input.abilityReq = false;
  input.joy = null;
  input.aimJoy = null;
  input.aimDirection = null;
  input.aim = null;
  $("bFire").classList.remove("down");
}

export function bindInput(stage: HTMLElement, hooks: InputHooks) {
  addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k) && hooks.isPlaying()) e.preventDefault();
    if (hooks.onKey(k)) { e.preventDefault(); return; }
    input.keys.add(k);
    if (hooks.isPlaying() && (k === "k" || k === "q") && !e.repeat) input.potionReq = true;
    if (hooks.isPlaying() && k === "e" && !e.repeat) input.abilityReq = true;
  });
  addEventListener("keyup", (e) => input.keys.delete(e.key.toLowerCase()));
  addEventListener("blur", () => { input.keys.clear(); releaseTouch(); });

  // touch: drag on the left 60% of the stage is a floating joystick
  const local = (e: PointerEvent) => { const r = stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width }; };
  stage.addEventListener("pointerdown", (e) => {
    if ((e.target as HTMLElement).closest("button") || !hooks.isPlaying()) return;
    if (e.pointerType === "mouse") {
      if (e.button === 0) { input.fireMouse = true; $("bFire").classList.add("down"); }
      return;
    }
    const q = local(e);
    if (q.x < q.w * 0.6 && !input.joy) {
      input.joy = { id: e.pointerId, ox: q.x, oy: q.y, x: q.x, y: q.y };
      try { stage.setPointerCapture(e.pointerId); } catch { /* not all browsers allow capture here */ }
    } else if (q.x >= q.w * 0.6 && !input.aimJoy) {
      input.aimJoy = { id: e.pointerId, ox: q.x, oy: q.y, x: q.x, y: q.y };
      try { stage.setPointerCapture(e.pointerId); } catch { /* not all browsers allow capture here */ }
    }
  });
  stage.addEventListener("pointermove", (e) => {
    if (e.pointerType === "mouse" && S.cam) {
      const r = stage.getBoundingClientRect(), q = local(e);
      input.aim = { x: S.cam.x + (q.x / r.width) * S.cam.w, y: S.cam.y + (q.y / r.height) * S.cam.h };
    }
    if (input.joy && e.pointerId === input.joy.id) { const q = local(e); input.joy.x = q.x; input.joy.y = q.y; }
    if (input.aimJoy && e.pointerId === input.aimJoy.id) { const q = local(e); input.aimJoy.x = q.x; input.aimJoy.y = q.y; }
  });
  const endJoy = (e: PointerEvent) => {
    if (e.pointerType === "mouse") { input.fireMouse = false; $("bFire").classList.remove("down"); }
    if (input.joy && e.pointerId === input.joy.id) input.joy = null;
    if (input.aimJoy && e.pointerId === input.aimJoy.id) { input.aimJoy = null; input.aimDirection = null; }
  };
  stage.addEventListener("pointerup", endJoy);
  stage.addEventListener("pointercancel", endJoy);
  stage.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") input.aim = null; });
  addEventListener("pointerup", (e) => {
    if (e.pointerType === "mouse") { input.fireMouse = false; $("bFire").classList.remove("down"); }
  });

  const fire = $("bFire");
  fire.addEventListener("pointerdown", (e) => { e.preventDefault(); input.fireTouch = true; fire.classList.add("down"); });
  for (const t of ["pointerup", "pointercancel", "pointerleave"]) fire.addEventListener(t, () => { input.fireTouch = false; fire.classList.remove("down"); });
  $("bPot").addEventListener("pointerdown", (e) => { e.preventDefault(); if (hooks.isPlaying()) input.potionReq = true; });
  $("bAbility").addEventListener("pointerdown", (e) => { e.preventDefault(); if (hooks.isPlaying()) input.abilityReq = true; });
}
