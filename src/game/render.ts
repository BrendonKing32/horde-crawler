import { GATES } from "../gen/generator";
import { BULBS, C, DISPLAY_FONT, PAIR, T, hash, reducedMotion } from "./constants";
import { input } from "./input";
import { blackoutRadii } from "./lighting";
import { highTide, inAstralBeam } from "./area-mechanics";
import { S } from "./state";
import type { Enemy, Player } from "./types";

let cv: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let dpr = 1, cw = 1, ch = 1, zoom = 1;
let reduce = false;

export function initCanvas(canvas: HTMLCanvasElement) {
  cv = canvas;
  ctx = canvas.getContext("2d")!;
  reduce = reducedMotion();
  const resize = () => {
    const r = cv.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2);
    cw = Math.max(1, r.width); ch = Math.max(1, r.height);
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    zoom = Math.max(0.68, Math.min(1.5, cw / (18 * T)));
  };
  new ResizeObserver(resize).observe(cv);
  resize();
}

export function render() {
  const p = S.p, now = performance.now() / 1000;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = C.void;
  ctx.fillRect(0, 0, cw, ch);
  const vw = cw / zoom, vh = ch / zoom;
  const camX = S.mw <= vw ? (S.mw - vw) / 2 : Math.max(0, Math.min(S.mw - vw, p.x - vw / 2));
  const camY = S.mh <= vh ? (S.mh - vh) / 2 : Math.max(0, Math.min(S.mh - vh, p.y - vh / 2));
  S.cam = { x: camX, y: camY, w: vw, h: vh };
  const z = dpr * zoom;
  ctx.setTransform(z, 0, 0, z, -camX * z, -camY * z);

  drawTiles(camX, camY, vw, vh, now);
  drawAstralBeam();
  drawFloorObjects(now);
  drawEnemies(now);
  drawProjectiles(now);
  drawPlayer(p);
  if (input.aim) {
    ctx.strokeStyle = "rgba(236,230,216,.75)"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(input.aim.x, input.aim.y, 8, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(input.aim.x - 12, input.aim.y); ctx.lineTo(input.aim.x - 5, input.aim.y);
    ctx.moveTo(input.aim.x + 5, input.aim.y); ctx.lineTo(input.aim.x + 12, input.aim.y);
    ctx.moveTo(input.aim.x, input.aim.y - 12); ctx.lineTo(input.aim.x, input.aim.y - 5);
    ctx.moveTo(input.aim.x, input.aim.y + 5); ctx.lineTo(input.aim.x, input.aim.y + 12); ctx.stroke();
  }
  ctx.textAlign = "center";
  ctx.font = `700 12px ${DISPLAY_FONT}`;
  for (const q of S.pops) { ctx.globalAlpha = Math.min(1, q.t * 2); ctx.fillStyle = q.color; ctx.fillText(q.text, q.x, q.y); }
  ctx.globalAlpha = 1;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawScreenOverlays(camX, camY, now);
}

// ---------------------------------------------------------------- tiles

function drawTiles(camX: number, camY: number, vw: number, vh: number, now: number) {
  const x0 = Math.max(0, Math.floor(camX / T)), x1 = Math.min(S.cols - 1, Math.floor((camX + vw) / T));
  const y0 = Math.max(0, Math.floor(camY / T)), y1 = Math.min(S.rows - 1, Math.floor((camY + vh) / T));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const c = S.grid[y][x];
    if (c === "#" || c === "H") drawWall(x, y, now);
    else drawFloor(x, y, c, now);
  }
  for (const o of S.opening) drawGate(o.tx * T, o.ty * T, PAIR[o.id], o.t / 0.6);
}

function drawWall(x: number, y: number, now: number) {
  const B = S.area, h = hash(x, y), px = x * T, py = y * T;
  ctx.fillStyle = B.wall;
  ctx.fillRect(px, py, T, T);
  const below = S.grid[y + 1]?.[x];
  const open = !!below && below !== "#";
  if (S.grid[y - 1]?.[x] !== "#") { ctx.fillStyle = B.hi; ctx.fillRect(px, py, T, B.style === "rock" ? 3 + (h % 3) : 5); }
  if (open) { ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.fillRect(px, py + T - 4, T, 4); }
  switch (B.style) {
    case "brick":
      ctx.fillStyle = "rgba(0,0,0,.18)";
      ctx.fillRect(px + (y % 2 ? T / 2 : 0), py + T / 2, 1, T / 2);
      ctx.fillRect(px, py + T / 2, T, 1);
      break;
    case "carnival": {
      if (S.tentWall.has(y * S.cols + x)) {
        for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? "#c9b896" : "#8e2a3f"; ctx.fillRect(px + i * 8, py, 8, T); }
        ctx.fillStyle = "rgba(10,6,16,.25)"; ctx.fillRect(px, py, T, T);
        if (open) { ctx.fillStyle = "rgba(0,0,0,.4)"; ctx.fillRect(px, py + T - 4, T, 4); }
      } else {
        ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.fillRect(px, py + T / 2 - 1, T, 2);
        ctx.fillStyle = B.hi; ctx.fillRect(px + 4, py + 5, 3, T - 8); ctx.fillRect(px + 20, py + 5, 3, T - 8);
        if (open) for (let i = 0; i < 2; i++) {
          const on = !S.dark && !(S.flick && Math.floor(now * 10 + i + x) % 2), col = BULBS[(x * 2 + i) % 4];
          ctx.fillStyle = on ? col : "#2a2230";
          ctx.beginPath(); ctx.arc(px + 8 + i * 16, py + T - 6, 2.6, 0, 7); ctx.fill();
          if (on) { ctx.globalAlpha = 0.2; ctx.beginPath(); ctx.arc(px + 8 + i * 16, py + T - 6, 7, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
        }
      }
      break;
    }
    case "plague":
      ctx.fillStyle = "rgba(0,0,0,.18)";
      ctx.fillRect(px + (y % 2 ? T / 2 : 0), py + T / 2, 1, T / 2);
      ctx.fillRect(px, py + T / 2, T, 1);
      if (open && h % 3 === 0) { ctx.fillStyle = B.fleck; ctx.globalAlpha = 0.55; ctx.fillRect(px + 4 + (h % 22), py + T - 12, 2, 8 + ((h >> 4) % 4)); ctx.globalAlpha = 1; }
      break;
    case "rock":
      ctx.fillStyle = "rgba(0,0,0,.22)"; ctx.fillRect(px + (h % 23), py + 8 + ((h >> 5) % 14), 4 + ((h >> 3) % 5), 3);
      ctx.fillStyle = B.fleck; ctx.fillRect(px + ((h >> 4) % 26), py + 6 + ((h >> 9) % 18), 2, 2);
      break;
    case "bone":
      ctx.fillStyle = "rgba(0,0,0,.2)";
      ctx.fillRect(px, py + 10, T, 1); ctx.fillRect(px, py + 21, T, 1); ctx.fillRect(px + (y % 2 ? 8 : 22), py + 10, 1, 11);
      if (open && h % 5 === 0) { // skull niche
        ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(px + 8, py + 12, 16, 12);
        ctx.fillStyle = B.fleck; ctx.beginPath(); ctx.arc(px + 16, py + 19, 4.5, 0, 7); ctx.fill();
        ctx.fillStyle = "#141010"; ctx.fillRect(px + 13.5, py + 17, 2, 2); ctx.fillRect(px + 16.5, py + 17, 2, 2);
      }
      break;
    case "archive":
      ctx.fillStyle = "#182f38"; ctx.fillRect(px + 3, py + 6, T - 6, 20);
      ctx.fillStyle = B.hi;
      for (let i = 0; i < 4; i++) ctx.fillRect(px + 5 + i * 6, py + 8, 3, 14);
      break;
    case "foundry":
      ctx.fillStyle = "rgba(0,0,0,.4)"; ctx.fillRect(px, py + 14, T, 4);
      ctx.fillStyle = B.hi; ctx.fillRect(px + 5, py + 6, 3, 3); ctx.fillRect(px + 24, py + 23, 3, 3);
      break;
    case "hollow":
      ctx.strokeStyle = B.hi; ctx.lineWidth = 3; ctx.beginPath();
      ctx.moveTo(px + 3, py); ctx.lineTo(px + 13, py + 15); ctx.lineTo(px + 8, py + T); ctx.stroke();
      break;
    case "observatory":
      ctx.strokeStyle = B.hi; ctx.lineWidth = 1; ctx.strokeRect(px + 4, py + 4, T - 8, T - 8);
      ctx.fillStyle = B.fleck; ctx.fillRect(px + 15, py + 15, 2, 2);
      break;
  }
}

function drawFloor(x: number, y: number, c: string, now: number) {
  const B = S.area, h = hash(x, y), px = x * T, py = y * T, k = y * S.cols + x;
  if (c === "Q") {
    ctx.fillStyle = (x + y) % 2 ? "#9b713e" : "#a87c45"; ctx.fillRect(px, py, T, T);
    ctx.strokeStyle = "rgba(241,203,137,.45)"; ctx.lineWidth = 1.5;
    for (let i = 0; i < 2; i++) {
      const yy = py + 9 + i * 13 + (reduce ? 0 : Math.sin(now * 2 + x + y) * 1.5);
      ctx.beginPath(); ctx.moveTo(px + 4, yy); ctx.quadraticCurveTo(px + 16, yy + 4, px + 28, yy); ctx.stroke();
    }
    return;
  }
  ctx.fillStyle = (x + y) % 2 ? B.a : B.b;
  ctx.fillRect(px, py, T, T);
  if (S.tentFloor.has(k)) { ctx.fillStyle = (x + y) % 2 ? "#241519" : "#28171d"; ctx.fillRect(px, py, T, T); }
  if (B.style === "archive" && highTide(S.time)) { ctx.fillStyle = "rgba(49,151,177,.32)"; ctx.fillRect(px, py, T, T); }
  if (S.conveyors.has(k)) {
    const dir = (Math.floor(S.time / 4) + y) % 2 ? -1 : 1;
    ctx.fillStyle = "#71563c"; ctx.fillRect(px + 2, py + 4, T - 4, T - 8);
    ctx.fillStyle = "#e0ae64";
    ctx.beginPath(); ctx.moveTo(px + 16 + dir * 7, py + 16); ctx.lineTo(px + 16 - dir * 5, py + 9); ctx.lineTo(px + 16 - dir * 5, py + 23); ctx.fill();
  }
  if (S.spores.has(k)) {
    ctx.fillStyle = "#b0d875"; ctx.beginPath(); ctx.arc(px + 16, py + 16, 7, 0, 7); ctx.fill();
    ctx.fillStyle = "#3e5a2a"; ctx.fillRect(px + 13, py + 13, 3, 3); ctx.fillRect(px + 18, py + 17, 3, 3);
  }
  if (S.pools.has(k)) {
    ctx.fillStyle = "rgba(110,150,36,.55)"; ctx.fillRect(px, py, T, T);
    if (!reduce && (h + Math.floor(now * 2)) % 7 === 0) { ctx.fillStyle = "rgba(190,220,110,.65)"; ctx.beginPath(); ctx.arc(px + 8 + (h % 16), py + 8 + ((h >> 4) % 16), 2.5, 0, 7); ctx.fill(); }
  }

  // floor flecks per area
  ctx.fillStyle = B.fleck;
  if (B.style === "rock" && h % 9 === 0) { ctx.globalAlpha = 0.35; ctx.fillRect(px + ((h >> 3) % 26), py + ((h >> 7) % 26), 3, 2); }
  else if (B.style === "plague" && h % 11 === 0) { ctx.globalAlpha = 0.18; ctx.beginPath(); ctx.ellipse(px + 16, py + 16, 8 + ((h >> 3) % 6), 4 + ((h >> 6) % 3), 0, 0, 7); ctx.fill(); }
  else if (B.style === "carnival" && h % 7 === 0) { ctx.globalAlpha = 0.22; ctx.fillRect(px + ((h >> 3) % 26), py + ((h >> 7) % 26), 2, 2); ctx.fillRect(px + ((h >> 5) % 26), py + ((h >> 9) % 26), 2, 1); }
  else if (B.style === "bone" && h % 13 === 0) { ctx.globalAlpha = 0.3; ctx.fillRect(px + 6 + ((h >> 3) % 14), py + 8 + ((h >> 6) % 14), 9, 2); }
  ctx.globalAlpha = 1;
  if (c === "D") {
    ctx.fillStyle = "#3a2e14"; ctx.fillRect(px + 2, py + 2, T - 4, T - 4);
    ctx.fillStyle = C.gold;
    for (let i = 0; i < 4; i++) ctx.fillRect(px + 5 + i * 7, py + 3, 3, T - 6);
    ctx.fillRect(px + 3, py + T / 2 - 2, T - 6, 4);
  } else if (GATES.includes(c)) drawGate(px, py, PAIR[GATES.indexOf(c)], 1);
}

function drawAstralBeam() {
  if (S.area.style !== "observatory") return;
  const x = S.mw / 2, y = S.mh / 2, angle = S.time * 0.35;
  ctx.strokeStyle = "rgba(190,180,255,.22)"; ctx.lineWidth = T * 1.5;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(angle) * Math.hypot(S.mw, S.mh), y + Math.sin(angle) * Math.hypot(S.mw, S.mh)); ctx.stroke();
}

/** Gate bars; k < 1 while sliding open. */
function drawGate(px: number, py: number, col: string, k: number) {
  ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.fillRect(px, py, T, T * k);
  ctx.fillStyle = col;
  for (let i = 0; i < 4; i++) ctx.fillRect(px + 4 + i * 7, py + 1, 3, (T - 2) * k);
  ctx.fillRect(px + 1, py + 1, T - 2, 3);
}

// ---------------------------------------------------------------- objects

function drawFloorObjects(now: number) {
  if (S.exit) {
    const e = S.exit, pulse = reduce ? 0 : Math.sin(now * 3) * 2;
    ctx.fillStyle = "rgba(242,165,65,.12)"; ctx.beginPath(); ctx.arc(e.x, e.y, 22 + pulse, 0, 7); ctx.fill();
    ctx.strokeStyle = C.torch; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(e.x, e.y, 14 + pulse / 2, 0, 7); ctx.stroke();
    const locked = S.bossFloor && !S.bossDefeated;
    ctx.fillStyle = locked ? C.blood : C.torch;
    ctx.font = `700 9px ${DISPLAY_FONT}`; ctx.textAlign = "center";
    ctx.fillText(locked ? "LOCKED" : "EXIT", e.x, e.y + 3.5);
  }
  for (const k of S.pickups) {
    if (!k.alive) continue;
    const { x, y } = k;
    if (k.type === "F") {
      ctx.fillStyle = "#c97a3c"; ctx.beginPath(); ctx.ellipse(x - 2, y, 8, 6, -0.5, 0, 7); ctx.fill();
      ctx.fillStyle = C.ink; ctx.fillRect(x + 3, y + 1, 6, 3); ctx.beginPath(); ctx.arc(x + 9, y + 2.5, 2.4, 0, 7); ctx.fill();
    } else if (k.type === "O") {
      ctx.fillStyle = C.mana; ctx.beginPath(); ctx.arc(x, y + 2, 7, 0, 7); ctx.fill(); ctx.fillRect(x - 2.5, y - 9, 5, 6);
      ctx.fillStyle = "rgba(255,255,255,.5)"; ctx.fillRect(x - 3, y - 1, 2, 4);
    } else if (k.type === "K") {
      ctx.strokeStyle = C.gold; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x - 5, y, 4.5, 0, 7); ctx.stroke();
      ctx.fillStyle = C.gold; ctx.fillRect(x - 1, y - 1.5, 11, 3); ctx.fillRect(x + 6, y, 2.5, 5); ctx.fillRect(x + 2.5, y, 2.5, 4);
    } else {
      ctx.fillStyle = C.gold;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(x - 5 + i * 5, y + 4 - i * 3, 5, 3, 0, 0, 7); ctx.fill(); }
      ctx.fillStyle = "#9c7a22"; ctx.fillRect(x - 9, y + 5, 16, 2);
    }
  }
  for (const tr of S.traps) {
    const px = tr.tx * T, py = tr.ty * T;
    if (tr.kind === "press") {
      ctx.fillStyle = tr.up ? "#d67236" : tr.warn ? "#ffcc66" : "#4f4033";
      ctx.fillRect(px + 3, py + 3, T - 6, T - 6);
      ctx.strokeStyle = "#e8b46b"; ctx.lineWidth = 2; ctx.strokeRect(px + 7, py + 7, T - 14, T - 14);
      continue;
    }
    ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.fillRect(px + 3, py + 3, T - 6, T - 6);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const sx = px + 8 + i * 8, sy = py + 8 + j * 8;
      if (tr.up) { ctx.fillStyle = C.ink; ctx.beginPath(); ctx.moveTo(sx - 3, sy + 3); ctx.lineTo(sx, sy - 5); ctx.lineTo(sx + 3, sy + 3); ctx.fill(); }
      else { ctx.fillStyle = tr.warn && (reduce || Math.floor(now * 12) % 2) ? C.blood : "#070909"; ctx.fillRect(sx - 1.5, sy - 1.5, 3, 3); }
    }
  }
  for (const b of S.bones) {
    const sh = b.t < 0.8 && !reduce ? Math.sin(now * 40) * 1.5 : 0;
    ctx.fillStyle = C.ink; ctx.globalAlpha = 0.75;
    ctx.fillRect(b.x - 8 + sh, b.y + 2, 10, 2.5); ctx.fillRect(b.x - 2 - sh, b.y - 2, 9, 2.5);
    ctx.beginPath(); ctx.arc(b.x + 5 + sh, b.y + 4, 3.5, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
  }
  for (const c of S.coffins) {
    if (!c.alive) continue;
    const px = c.tx * T, py = c.ty * T;
    ctx.fillStyle = c.hit > 0 ? C.ink : "#4a3a2a";
    ctx.beginPath();
    ctx.moveTo(px + 11, py + 2); ctx.lineTo(px + 21, py + 2); ctx.lineTo(px + 27, py + 10); ctx.lineTo(px + 22, py + 30); ctx.lineTo(px + 10, py + 30); ctx.lineTo(px + 5, py + 10);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#241a12"; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = "#8a7356"; ctx.fillRect(px + 15, py + 8, 2, 14); ctx.fillRect(px + 11, py + 12, 10, 2);
  }
  for (const l of S.levers) {
    const col = PAIR[l.id], { x, y } = l, a = l.on ? 0.6 : -0.6, hx = x + Math.sin(a) * 13, hy = y + 4 - Math.cos(a) * 13;
    if (!l.on) { ctx.globalAlpha = 0.2 + (reduce ? 0 : 0.08 * Math.sin(now * 4)); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 16, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
    ctx.fillStyle = "#2a2f3b"; ctx.fillRect(x - 9, y + 3, 18, 6); ctx.fillStyle = C.dim; ctx.fillRect(x - 9, y + 3, 18, 2);
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x, y + 4); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(hx, hy, 4, 0, 7); ctx.fill();
  }
  for (const g of S.gens) {
    const px = g.tx * T, py = g.ty * T;
    if (!g.alive) { ctx.fillStyle = "#2a2f3b"; ctx.fillRect(px + 5, py + 12, 9, 8); ctx.fillRect(px + 16, py + 16, 10, 7); ctx.fillRect(px + 10, py + 6, 7, 6); continue; }
    ctx.fillStyle = g.hit > 0 ? C.ink : "#2b1720"; ctx.fillRect(px + 2, py + 2, T - 4, T - 4);
    const gc = g.kind === "lobber" ? C.wisp : C.blood;
    ctx.strokeStyle = gc; ctx.lineWidth = 2; ctx.strokeRect(px + 3, py + 3, T - 6, T - 6);
    const r = 5 + (reduce ? 0 : Math.sin(now * 4 + g.tx) * 1.5);
    ctx.fillStyle = gc; ctx.beginPath(); ctx.arc(g.x, g.y, r, 0, 7); ctx.fill();
    ctx.fillStyle = C.ink; for (let i = 0; i < g.tier; i++) ctx.fillRect(px + 6 + i * 7, py + T - 8, 4, 3);
    ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.fillRect(px + 2, py - 6, T - 4, 3);
    ctx.fillStyle = C.blood; ctx.fillRect(px + 2, py - 6, ((T - 4) * g.hp) / g.max, 3);
  }
}

// ---------------------------------------------------------------- enemies

function drawEnemies(now: number) {
  const p = S.p;
  for (const e of S.enemies) {
    if (S.area.style === "observatory" && inAstralBeam(e.x, e.y, S.mw, S.mh, S.time)) {
      ctx.strokeStyle = "#c5bcff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 5, 0, 7); ctx.stroke();
    }
    const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
    if (e.type === "boss") drawBoss(e, now);
    else if (e.type === "reaper") drawReaper(e, dx / d, now);
    else if (e.type === "biter" && e.under) {
      const j = reduce ? 0 : Math.sin(now * 20 + e.x) * 2;
      ctx.fillStyle = "#47392b"; ctx.beginPath(); ctx.ellipse(e.x, e.y + 2, 9, 5, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#8a7a52"; ctx.fillRect(e.x - 5 + j, e.y - 1, 2, 2); ctx.fillRect(e.x + 3 - j, e.y, 2, 2);
    } else if (e.type === "biter") drawBiter(e, dx / d, dy / d, now);
    else if (e.type === "archer") {
      ctx.fillStyle = (e.hit || 0) > 0 ? C.ink : "#dfb86e";
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, 7); ctx.fill();
      ctx.strokeStyle = "#513321"; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = "#513321"; ctx.fillRect(e.x - 6, e.y - 3, 12, 3);
      ctx.strokeStyle = "#f4d395"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(e.x + dx / d * 6, e.y + dy / d * 6, 8, Math.atan2(dy, dx) - 1.1, Math.atan2(dy, dx) + 1.1); ctx.stroke();
    } else if (e.type === "lobber") {
      const lift = (e.wind || 0) > 0 ? -5 : 0, ux = dx / d, uy = dy / d;
      ctx.fillStyle = "#3b2f5c"; ctx.beginPath(); ctx.arc(e.x - ux * 7, e.y - uy * 7 - 2, 6.5, 0, 7); ctx.fill();
      ctx.fillStyle = (e.hit || 0) > 0 ? C.ink : C.wisp; ctx.beginPath(); ctx.ellipse(e.x, e.y + 1, e.r, e.r - 2, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#2a2216"; ctx.beginPath(); ctx.arc(e.x + ux * 9, e.y + uy * 9 + lift, 3.5, 0, 7); ctx.fill();
      ctx.fillStyle = "#1a1426"; ctx.fillRect(e.x - 4 + ux * 2, e.y - 3 + uy * 2, 2.5, 2.5); ctx.fillRect(e.x + 1.5 + ux * 2, e.y - 3 + uy * 2, 2.5, 2.5);
    } else {
      ctx.fillStyle = (e.hit || 0) > 0 ? C.ink : C.blood; ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.arc(e.x, e.y + 3, e.r - 3, 0, Math.PI); ctx.fill();
      const ex = (dx / d) * 3, ey = (dy / d) * 3;
      ctx.fillStyle = "#170a0e"; ctx.fillRect(e.x - 4 + ex, e.y - 3 + ey, 2.5, 2.5); ctx.fillRect(e.x + 1.5 + ex, e.y - 3 + ey, 2.5, 2.5);
    }
  }
}

function drawReaper(e: Enemy, ux: number, now: number) {
  ctx.globalAlpha = e.inWall ? 0.5 : 1;
  const y = e.y + (reduce ? 0 : Math.sin(now * 2 + e.x) * 2), fx = ux * 2;
  ctx.fillStyle = "rgba(201,182,255,.14)"; ctx.beginPath(); ctx.arc(e.x, y, e.r + 8, 0, 7); ctx.fill();
  ctx.fillStyle = (e.ping || 0) > 0 ? "#3a3352" : "#120f1c";
  ctx.beginPath(); ctx.moveTo(e.x, y - 16); ctx.quadraticCurveTo(e.x + 15, y - 10, e.x + 13, y + 12); ctx.lineTo(e.x - 13, y + 12); ctx.quadraticCurveTo(e.x - 15, y - 10, e.x, y - 16); ctx.fill();
  ctx.strokeStyle = C.wisp; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = C.ink; ctx.beginPath(); ctx.ellipse(e.x + fx, y - 5, 5, 6, 0, 0, 7); ctx.fill();
  ctx.fillStyle = "#120f1c"; ctx.fillRect(e.x - 3.5 + fx, y - 7, 2.5, 3); ctx.fillRect(e.x + 1 + fx, y - 7, 2.5, 3);
  ctx.strokeStyle = C.dim; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(e.x + 14, y + 12); ctx.lineTo(e.x + 14, y - 14); ctx.stroke();
  ctx.strokeStyle = C.ink; ctx.beginPath(); ctx.moveTo(e.x + 14, y - 14); ctx.quadraticCurveTo(e.x + 4, y - 20, e.x - 2, y - 12); ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawBoss(e: Enemy, now: number) {
  const pulse = reduce ? 0 : Math.sin(now * 5) * 2;
  if ((e.chargeWind || 0) > 0) {
    ctx.strokeStyle = `rgba(242,165,65,${0.35 + (e.chargeWind || 0) * 0.5})`;
    ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(e.x, e.y, 27 + pulse, 0, 7); ctx.stroke();
  }
  ctx.fillStyle = "rgba(214,67,91,.2)"; ctx.beginPath(); ctx.arc(e.x, e.y, 27 + pulse, 0, 7); ctx.fill();
  ctx.fillStyle = (e.hit || 0) > 0 ? C.ink : "#7f263b";
  ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, 7); ctx.fill();
  ctx.strokeStyle = "#e76a73"; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.fillStyle = "#401322";
  ctx.beginPath(); ctx.moveTo(e.x - 10, e.y - 9); ctx.lineTo(e.x - 18, e.y - 25); ctx.lineTo(e.x - 3, e.y - 16); ctx.fill();
  ctx.beginPath(); ctx.moveTo(e.x + 10, e.y - 9); ctx.lineTo(e.x + 18, e.y - 25); ctx.lineTo(e.x + 3, e.y - 16); ctx.fill();
  ctx.fillStyle = C.torch;
  ctx.fillRect(e.x - 7, e.y - 3, 4, 4); ctx.fillRect(e.x + 3, e.y - 3, 4, 4);
  ctx.fillStyle = "rgba(0,0,0,.7)"; ctx.fillRect(e.x - 20, e.y - 29, 40, 4);
  ctx.fillStyle = C.blood; ctx.fillRect(e.x - 20, e.y - 29, 40 * Math.max(0, e.hp) / (e.maxHp || e.hp), 4);
}

function drawBiter(e: Enemy, ux: number, uy: number, now: number) {
  const w = reduce ? 0 : Math.sin(now * 24 + e.x) * 1.5, ex = ux * 2, ey = uy * 2;
  ctx.fillStyle = (e.hit || 0) > 0 ? C.ink : C.biter;
  ctx.fillRect(e.x - 5, e.y + 3 + w, 2, 3); ctx.fillRect(e.x + 3, e.y + 3 - w, 2, 3);
  ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, 7); ctx.fill();
  ctx.fillStyle = "#1d2209"; ctx.fillRect(e.x - 3 + ex, e.y - 2 + ey, 2, 2); ctx.fillRect(e.x + 1 + ex, e.y - 2 + ey, 2, 2);
  ctx.fillStyle = C.ink; ctx.fillRect(e.x - 2 + ex * 1.5, e.y + 1 + ey * 1.5, 4, 1.5);
  if (S.area.carnival) { // wind-up key
    const a = reduce ? 0.6 : now * 8;
    ctx.strokeStyle = C.gold; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(e.x, e.y - 6); ctx.lineTo(e.x, e.y - 10); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(e.x, e.y - 11.5, 4 * Math.abs(Math.cos(a)) + 0.5, 2, 0, 0, 7); ctx.stroke();
  }
}

// ---------------------------------------------------------------- projectiles & player

function drawProjectiles(now: number) {
  for (const s of S.shots) {
    ctx.strokeStyle = "rgba(242,165,65,.4)"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(s.x - s.vx * 0.025, s.y - s.vy * 0.025); ctx.lineTo(s.x, s.y); ctx.stroke();
    ctx.fillStyle = C.torch; ctx.beginPath(); ctx.arc(s.x, s.y, 3.2, 0, 7); ctx.fill();
  }
  for (const s of S.enemyShots) {
    ctx.strokeStyle = "#f4d395"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(s.x - s.vx * 0.04, s.y - s.vy * 0.04); ctx.lineTo(s.x, s.y); ctx.stroke();
    ctx.fillStyle = "#e46046"; ctx.beginPath(); ctx.arc(s.x, s.y, 3, 0, 7); ctx.fill();
  }
  for (const b of S.bombs) {
    const u = b.t / b.dur;
    ctx.fillStyle = `rgba(214,67,91,${0.06 + u * 0.16})`; ctx.beginPath(); ctx.arc(b.tx, b.ty, 34, 0, 7); ctx.fill();
    ctx.strokeStyle = `rgba(214,67,91,${0.3 + u * 0.6})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(b.tx, b.ty, 34 * (1 - u * 0.5), 0, 7); ctx.stroke();
    const bx = b.sx + (b.tx - b.sx) * u, by = b.sy + (b.ty - b.sy) * u, h = Math.sin(Math.PI * u) * 70;
    ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(bx, by + 4, 5, 2.5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = S.area.plague ? "#55721f" : "#2a2216"; ctx.beginPath(); ctx.arc(bx, by - h, 5.5, 0, 7); ctx.fill();
    ctx.fillStyle = C.torch; ctx.fillRect(bx - 1, by - h - 8, 2, 3);
  }
  for (const r of S.rocks) {
    const u = r.t / r.dur, k = 0.5 + u * 0.5;
    ctx.fillStyle = `rgba(0,0,0,${0.15 + u * 0.4})`; ctx.beginPath(); ctx.ellipse(r.x, r.y, 30 * k, 14 * k, 0, 0, 7); ctx.fill();
    if (u > 0.55) {
      const fy = r.y - ((1 - u) / 0.45) * 90;
      ctx.fillStyle = "#6f5a40"; ctx.beginPath(); ctx.arc(r.x, fy, 9, 0, 7); ctx.fill();
      ctx.fillStyle = "#47392b"; ctx.fillRect(r.x - 4, fy - 2, 5, 4);
    } else if (!reduce) { ctx.fillStyle = "#8a7a52"; ctx.fillRect(r.x + (hash(r.x | 0, Math.floor(now * 8)) % 30) - 15, r.y - 4, 2, 2); }
  }
  for (const b of S.balloons) {
    const y = b.y - 10 + (reduce ? 0 : Math.sin(now * 3 + b.x * 0.1) * 2);
    ctx.strokeStyle = "rgba(236,230,216,.5)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(b.x, y + 9); ctx.quadraticCurveTo(b.x + 3, y + 15, b.x, b.y + 6); ctx.stroke();
    ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.beginPath(); ctx.ellipse(b.x, b.y + 8, 5, 2, 0, 0, 7); ctx.fill();
    ctx.fillStyle = b.c; ctx.beginPath(); ctx.ellipse(b.x, y, 7, 9, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.45)"; ctx.beginPath(); ctx.ellipse(b.x - 2.5, y - 3, 2, 3, -0.4, 0, 7); ctx.fill();
  }
  for (const c of S.clouds) {
    const a = Math.min(1, c.t) * 0.2, w = reduce ? 0 : now;
    ctx.fillStyle = `rgba(155,191,74,${a})`;
    for (let i = 0; i < 5; i++) {
      const ang = c.seed + i * 1.26 + w * 0.4;
      ctx.beginPath(); ctx.arc(c.x + Math.cos(ang) * c.r * 0.28, c.y + Math.sin(ang) * c.r * 0.22, c.r * 0.6, 0, 7); ctx.fill();
    }
  }
  for (const q of S.booms) {
    const u = 1 - q.t / 0.35;
    ctx.fillStyle = `rgba(242,165,65,${0.55 * (1 - u)})`; ctx.beginPath(); ctx.arc(q.x, q.y, 14 + 24 * u, 0, 7); ctx.fill();
  }
}

function drawPlayer(p: Player) {
  ctx.fillStyle = "rgba(0,0,0,.4)"; ctx.beginPath(); ctx.ellipse(p.x, p.y + 9, 10, 4, 0, 0, 7); ctx.fill();
  ctx.fillStyle = p.blink > 0 ? C.ink : C[p.cls.color];
  ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
  ctx.strokeStyle = "#3a2408"; ctx.lineWidth = 2; ctx.stroke();
  const fx = p.face.x, fy = p.face.y;
  ctx.fillStyle = "#3a2408"; ctx.beginPath();
  ctx.moveTo(p.x + fx * 15, p.y + fy * 15); ctx.lineTo(p.x + fx * 6 - fy * 5, p.y + fy * 6 + fx * 5); ctx.lineTo(p.x + fx * 6 + fy * 5, p.y + fy * 6 - fx * 5);
  ctx.fill();
}

// ---------------------------------------------------------------- screen space

function drawScreenOverlays(camX: number, camY: number, now: number) {
  const p = S.p;
  // torchlight: shrinks with health; lights-out shrinks it hard
  const sx = (p.x - camX) * zoom, sy = (p.y - camY) * zoom, R = Math.max(cw, ch);
  let light = 0.22 + 0.38 * Math.min(1, Math.max(0, p.hp) / p.maxHp);
  if (S.flick && !reduce && Math.floor(now * 10) % 2) light *= 0.8;
  const radii = S.dark
    ? blackoutRadii(zoom, p.hp / p.maxHp)
    : { inner: R * light * 0.5, outer: R * (light + 0.35) };
  const gr = ctx.createRadialGradient(sx, sy, radii.inner, sx, sy, radii.outer);
  const sh = S.area.shade;
  gr.addColorStop(0, `rgba(${sh},0)`);
  gr.addColorStop(1, `rgba(${sh},${S.dark ? 1 : 0.88})`);
  ctx.fillStyle = gr; ctx.fillRect(0, 0, cw, ch);
  if (S.dark) for (const e of S.enemies) { // glowing eyes in the dark
    const ex = (e.x - camX) * zoom, ey = (e.y - camY) * zoom;
    if (ex < -10 || ey < -10 || ex > cw + 10 || ey > ch + 10) continue;
    ctx.fillStyle = e.type === "reaper" ? "#f4f0ff" : e.type === "biter" ? "#d9f27a" : "#ff5a6e";
    ctx.fillRect(ex - 4 * zoom, ey - 3 * zoom, 2.5 * zoom, 2.5 * zoom); ctx.fillRect(ex + 1.5 * zoom, ey - 3 * zoom, 2.5 * zoom, 2.5 * zoom);
  }
  if (p.hurt > 0.02) {
    const g2 = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.35, cw / 2, ch / 2, Math.max(cw, ch) * 0.75);
    g2.addColorStop(0, "rgba(214,67,91,0)"); g2.addColorStop(1, `rgba(214,67,91,${0.3 * p.hurt})`);
    ctx.fillStyle = g2; ctx.fillRect(0, 0, cw, ch);
  }
  if (S.flash > 0) { ctx.fillStyle = `rgba(255,240,215,${S.flash})`; ctx.fillRect(0, 0, cw, ch); }
  const joy = input.joy;
  if (joy) {
    ctx.strokeStyle = "rgba(236,230,216,.35)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(joy.ox, joy.oy, 50, 0, 7); ctx.stroke();
    let jx = joy.x - joy.ox, jy = joy.y - joy.oy;
    const m = Math.hypot(jx, jy);
    if (m > 50) { jx *= 50 / m; jy *= 50 / m; }
    ctx.fillStyle = "rgba(236,230,216,.4)"; ctx.beginPath(); ctx.arc(joy.ox + jx, joy.oy + jy, 20, 0, 7); ctx.fill();
  }
  const aimJoy = input.aimJoy;
  if (aimJoy) {
    ctx.strokeStyle = "rgba(98,210,194,.45)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(aimJoy.ox, aimJoy.oy, 50, 0, 7); ctx.stroke();
    let ax = aimJoy.x - aimJoy.ox, ay = aimJoy.y - aimJoy.oy;
    const m = Math.hypot(ax, ay);
    if (m > 50) { ax *= 50 / m; ay *= 50 / m; }
    ctx.fillStyle = "rgba(98,210,194,.5)"; ctx.beginPath(); ctx.arc(aimJoy.ox + ax, aimJoy.oy + ay, 20, 0, 7); ctx.fill();
  }
}
