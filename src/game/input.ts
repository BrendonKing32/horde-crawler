import { $ } from "./dom";

export interface Joystick { id: number; ox: number; oy: number; x: number; y: number }

/** Current input. Keys are lower-cased KeyboardEvent.key values. */
export const input = {
  keys: new Set<string>(),
  potionReq: false,
  fireTouch: false,
  joy: null as Joystick | null,
};

export interface InputHooks {
  isPlaying: () => boolean;
  /** Return true if the key was consumed (e.g. picking an upgrade). */
  onKey: (key: string) => boolean;
}

/** Drop held touch input (used when overlays open). */
export function releaseTouch() {
  input.fireTouch = false;
  input.joy = null;
  $("bFire").classList.remove("down");
}

export function bindInput(stage: HTMLElement, hooks: InputHooks) {
  addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k) && hooks.isPlaying()) e.preventDefault();
    if (hooks.onKey(k)) { e.preventDefault(); return; }
    input.keys.add(k);
    if ((k === "k" || k === "q") && !e.repeat) input.potionReq = true;
  });
  addEventListener("keyup", (e) => input.keys.delete(e.key.toLowerCase()));
  addEventListener("blur", () => { input.keys.clear(); input.fireTouch = false; input.joy = null; });

  // touch: drag on the left 60% of the stage is a floating joystick
  const local = (e: PointerEvent) => { const r = stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width }; };
  stage.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" || (e.target as HTMLElement).closest("button") || !hooks.isPlaying()) return;
    const q = local(e);
    if (q.x < q.w * 0.6 && !input.joy) {
      input.joy = { id: e.pointerId, ox: q.x, oy: q.y, x: q.x, y: q.y };
      try { stage.setPointerCapture(e.pointerId); } catch { /* not all browsers allow capture here */ }
    }
  });
  stage.addEventListener("pointermove", (e) => { if (input.joy && e.pointerId === input.joy.id) { const q = local(e); input.joy.x = q.x; input.joy.y = q.y; } });
  const endJoy = (e: PointerEvent) => { if (input.joy && e.pointerId === input.joy.id) input.joy = null; };
  stage.addEventListener("pointerup", endJoy);
  stage.addEventListener("pointercancel", endJoy);

  const fire = $("bFire");
  fire.addEventListener("pointerdown", (e) => { e.preventDefault(); input.fireTouch = true; fire.classList.add("down"); });
  for (const t of ["pointerup", "pointercancel", "pointerleave"]) fire.addEventListener(t, () => { input.fireTouch = false; fire.classList.remove("down"); });
  $("bPot").addEventListener("pointerdown", (e) => { e.preventDefault(); input.potionReq = true; });
}
