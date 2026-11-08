import "./styles.css";
import { $ } from "./game/dom";
import { bindScreens, pickClass } from "./game/flow";
import { hud } from "./game/hud";
import { bindInput } from "./game/input";
import { chooseUpgrade } from "./game/progression";
import { initCanvas, render } from "./game/render";
import { S, newFloor } from "./game/state";
import { update } from "./game/update";

const stage = $("stage");
initCanvas($<HTMLCanvasElement>("cv"));
bindScreens();
bindInput(stage, {
  isPlaying: () => S.state === "play",
  onKey: (k) => {
    if (S.state === "levelup" && ["1", "2", "3"].includes(k)) { chooseUpgrade(Number(k) - 1); return true; }
    if (S.state !== "play" && !$("ovStart").hidden) {
      if (k === "1") pickClass("warden");
      if (k === "2") pickClass("ranger");
    }
    return false;
  },
});

// a floor renders behind the start screen
newFloor();

let prev = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - prev) / 1000);
  prev = now;
  if (S.state === "play" && !document.hidden) update(dt);
  render();
  hud();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
