"use strict";

const width = 64;
const height = 8;
const cell = 12;
// Five columns per glyph, with bit zero at the top of each column.
const font = {
  " ": [0, 0, 0, 0, 0],
  A: [0x7e, 0x11, 0x11, 0x11, 0x7e], B: [0x7f, 0x49, 0x49, 0x49, 0x36],
  C: [0x3e, 0x41, 0x41, 0x41, 0x22], D: [0x7f, 0x41, 0x41, 0x22, 0x1c],
  E: [0x7f, 0x49, 0x49, 0x49, 0x41], F: [0x7f, 0x09, 0x09, 0x09, 0x01],
  G: [0x3e, 0x41, 0x49, 0x49, 0x7a], H: [0x7f, 0x08, 0x08, 0x08, 0x7f],
  I: [0x41, 0x41, 0x7f, 0x41, 0x41], J: [0x20, 0x40, 0x41, 0x3f, 0x01],
  K: [0x7f, 0x08, 0x14, 0x22, 0x41], L: [0x7f, 0x40, 0x40, 0x40, 0x40],
  M: [0x7f, 0x02, 0x0c, 0x02, 0x7f], N: [0x7f, 0x04, 0x08, 0x10, 0x7f],
  O: [0x3e, 0x41, 0x41, 0x41, 0x3e], P: [0x7f, 0x09, 0x09, 0x09, 0x06],
  Q: [0x3e, 0x41, 0x51, 0x21, 0x5e], R: [0x7f, 0x09, 0x19, 0x29, 0x46],
  S: [0x46, 0x49, 0x49, 0x49, 0x31], T: [0x01, 0x01, 0x7f, 0x01, 0x01],
  U: [0x3f, 0x40, 0x40, 0x40, 0x3f], V: [0x1f, 0x20, 0x40, 0x20, 0x1f],
  W: [0x7f, 0x20, 0x18, 0x20, 0x7f], X: [0x63, 0x14, 0x08, 0x14, 0x63],
  Y: [0x03, 0x04, 0x78, 0x04, 0x03], Z: [0x61, 0x51, 0x49, 0x45, 0x43],
  0: [0x3e, 0x45, 0x49, 0x51, 0x3e], 1: [0, 0x42, 0x7f, 0x40, 0],
  2: [0x62, 0x51, 0x49, 0x49, 0x46], 3: [0x22, 0x41, 0x49, 0x49, 0x36],
  4: [0x18, 0x14, 0x12, 0x7f, 0x10], 5: [0x2f, 0x49, 0x49, 0x49, 0x31],
  6: [0x3e, 0x49, 0x49, 0x49, 0x32], 7: [0x01, 0x71, 0x09, 0x05, 0x03],
  8: [0x36, 0x49, 0x49, 0x49, 0x36], 9: [0x26, 0x49, 0x49, 0x49, 0x3e],
  ".": [0, 0x60, 0x60, 0, 0], ",": [0, 0x40, 0x30, 0, 0],
  "!": [0, 0, 0x5f, 0, 0], "?": [0x02, 0x01, 0x59, 0x09, 0x06],
  ":": [0, 0x36, 0x36, 0, 0], "-": [0, 0x08, 0x08, 0x08, 0],
  "*": [0, 0x14, 0x08, 0x14, 0],
};

const editor = document.querySelector("#editor");
const message = document.querySelector("#message");
const count = document.querySelector("#count");
const messageError = document.querySelector("#message-error");
const brightness = document.querySelector("#brightness");
const enabled = document.querySelector("#enabled");
const canvas = document.querySelector("#matrix");
const context = canvas.getContext("2d");
const status = document.querySelector("#status");
const connection = document.querySelector("#connection");
const retry = document.querySelector("#retry");
const pause = document.querySelector("#pause");
const scrollSpeed = document.querySelector("#scroll-speed");
const scrollSpeedValue = document.querySelector("#scroll-speed-value");
const scrollDirection = document.querySelector("#scroll-direction");
const alignment = document.querySelector("#alignment");
const scrollOptions = document.querySelector("#scroll-options");
const scrollDirectionField = document.querySelector("#scroll-direction-field");
const alignmentField = document.querySelector("#alignment-field");
const clipNote = document.querySelector("#clip-note");
const effectPanels = [...document.querySelectorAll("[data-effect-panel]")];
const motionByEffect = new Map(effectPanels.map(panel => [panel.dataset.effectPanel, {
  speed: Number(panel.dataset.scrollDefault ?? 0), direction: "left", alignment: "center",
}]));

let activeEffect;
let draft = readEditor();
let applied = draft;
let online = true;
let waitingForRetry = false;
let paused = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let animation = startAnimation(draft);
let lastTick = 0;
let lastPaint = 0;

function startAnimation(state) {
  return {
    time: 0,
    textX: alignedTextX(state),
    bounceDirection: 1,
    typed: 0,
    holdTime: 0,
  };
}

function readEditor() {
  const effect = editor.querySelector("input[name=effect]:checked").value;
  const panel = effectPanels.find(section => section.dataset.effectPanel === effect);
  if (effect !== activeEffect) {
    const motion = motionByEffect.get(effect);
    scrollSpeed.value = motion.speed;
    scrollDirection.value = motion.direction;
    alignment.value = motion.alignment;
    activeEffect = effect;
  }
  const scrollable = panel.dataset.scrollDefault !== undefined;
  const motion = { speed: scrollable ? scrollSpeed.valueAsNumber : 0, direction: scrollDirection.value, alignment: alignment.value };
  motionByEffect.set(effect, motion);
  scrollOptions.hidden = !scrollable;
  const settings = {};
  for (const input of panel.querySelectorAll("[data-setting]")) {
    let value = input.value;
    if (input.type === "checkbox") value = input.checked;
    if (input.type === "range") value = input.valueAsNumber;
    settings[input.dataset.setting] = value;
  }
  return { message: message.value, effect, settings, motion, brightness: brightness.valueAsNumber, enabled: enabled.checked };
}

function validMessage(value) {
  return /^[A-Za-z0-9 .,!?*:\-]*$/.test(value);
}

function previewState() {
  return validMessage(draft.message) ? draft : applied;
}

function updateEditor() {
  const previousEffect = previewState().effect;
  draft = readEditor();
  const valid = validMessage(draft.message);
  message.setAttribute("aria-invalid", String(!valid));
  messageError.hidden = valid;
  count.value = `${message.value.length} / ${message.maxLength}`;
  document.querySelector("#brightness-value").value = `${draft.brightness}%`;
  enabled.nextElementSibling.textContent = draft.enabled ? "On" : "Off";
  const stationary = draft.motion.speed === 0;
  scrollSpeedValue.value = `${draft.motion.speed} px/s`;
  scrollSpeed.setAttribute("aria-valuetext", stationary ? "0 pixels per second, stationary" : `${draft.motion.speed} pixels per second`);
  scrollDirectionField.hidden = stationary;
  alignmentField.hidden = !stationary;
  clipNote.hidden = !stationary || !valid || textWidth(draft.message) <= width;

  for (const panel of effectPanels) {
    panel.hidden = panel.dataset.effectPanel !== draft.effect;
    for (const range of panel.querySelectorAll("input[type=range]")) {
      panel.querySelector(`output[for="${range.id}"]`).value = range.value + range.dataset.unit;
    }
  }

  if (online && !waitingForRetry && valid) applied = draft;
  if (JSON.stringify(applied) === JSON.stringify(draft)) waitingForRetry = false;

  status.dataset.state = !online ? "offline" : waitingForRetry || !valid ? "draft" : "live";
  let messageStatus = "Live simulation";
  if (!online) messageStatus = "Offline · edits are previewed as a draft";
  else if (!valid) messageStatus = "Message contains unsupported characters";
  else if (waitingForRetry) messageStatus = "Reconnected · draft ready to apply";
  if (status.textContent !== messageStatus) status.textContent = messageStatus;
  retry.hidden = !online || !waitingForRetry;
  retry.disabled = !valid;
  connection.textContent = online ? "Simulate disconnect" : "Simulate reconnect";
  pause.textContent = paused ? "Play preview" : "Pause preview";
  const display = previewState();
  if (display.effect !== previousEffect) animation = startAnimation(display);
  // At zero speed the user controls placement. Resuming starts at that position.
  if (display.motion.speed === 0) animation.textX = alignedTextX(display);
  canvas.setAttribute("aria-label", `64 by 8 preview, ${display.enabled ? display.message : "display off"}`);
  paint();
}

editor.addEventListener("submit", event => event.preventDefault());
editor.addEventListener("input", updateEditor);
pause.addEventListener("click", () => {
  paused = !paused;
  updateEditor();
});
connection.addEventListener("click", () => {
  online = !online;
  waitingForRetry = online && JSON.stringify(applied) !== JSON.stringify(draft);
  updateEditor();
});
retry.addEventListener("click", () => {
  waitingForRetry = false;
  updateEditor();
});

function rgb(hex) {
  const color = Number.parseInt(hex.slice(1), 16);
  return [color >> 16, (color >> 8) & 255, color & 255];
}

function pixel(x, y, color, light) {
  if (x < 0 || x >= width || y < 0 || y >= height) return;
  context.fillStyle = `rgb(${color.map(channel => Math.round(channel * light)).join(",")})`;
  context.fillRect(x * cell + 1, y * cell + 1, cell - 2, cell - 2);
}

function drawText(text, start, getColor, light) {
  for (let index = 0; index < text.length; index++) {
    const left = start + index * 6;
    if (left + 5 <= 0 || left >= width) continue;
    const glyph = font[text[index]] ?? font["?"];
    for (let x = 0; x < glyph.length; x++) {
      for (let y = 0; y < 7; y++) {
        if (glyph[x] & (1 << y)) pixel(left + x, y, getColor(left + x, y), light);
      }
    }
  }
}

function textWidth(text) {
  return Math.max(0, text.length * 6 - 1);
}

function alignedTextX(state) {
  const space = width - textWidth(state.message);
  if (state.motion.alignment === "left") return 0;
  if (state.motion.alignment === "right") return space;
  return Math.floor(space / 2);
}

function advanceScroll(state, elapsed) {
  const length = textWidth(state.message);
  const { direction, speed } = state.motion;
  const step = speed * elapsed;
  if (direction === "left") {
    const edge = -length - 4;
    // Editing the text can shorten the offscreen part of the current pass.
    animation.textX = Math.max(edge, animation.textX) - step;
    if (animation.textX < edge) animation.textX += width - edge;
    animation.bounceDirection = -1;
    return;
  }
  if (direction === "right") {
    const edge = width + 4;
    animation.textX = Math.max(-length, animation.textX) + step;
    if (animation.textX >= edge) animation.textX -= edge + length;
    animation.bounceDirection = 1;
    return;
  }

  const min = Math.min(0, width - length);
  const max = Math.max(0, width - length);
  const span = max - min;
  const edge = Math.min(max, Math.max(min, animation.textX));
  const toEdge = edge - animation.textX;
  // New text can move the bounce boundary. Travel to it without a jump.
  if (Math.abs(toEdge) > step) {
    animation.textX += Math.sign(toEdge) * step;
    return;
  }
  if (span === 0) {
    animation.textX = edge;
    return;
  }
  const fromMin = edge - min;
  const phase = animation.bounceDirection > 0 ? fromMin : 2 * span - fromMin;
  const next = (phase + step - Math.abs(toEdge)) % (2 * span);
  animation.textX = min + Math.min(next, 2 * span - next);
  animation.bounceDirection = next < span ? 1 : -1;
}

function advanceAnimation(state, elapsed) {
  animation.time += elapsed;
  if (state.motion.speed > 0) {
    advanceScroll(state, elapsed);
  } else if (state.effect === "typewriter" && state.message.length > 0) {
    if (animation.typed < state.message.length) {
      animation.typed = Math.min(state.message.length, animation.typed + elapsed * state.settings.speed);
      animation.holdTime = 0;
    } else {
      animation.holdTime += elapsed;
      if (animation.holdTime >= 1.5) {
        animation.typed = 0;
        animation.holdTime = 0;
      }
    }
  }
}

function drawEffect(text, state) {
  const { settings, effect } = state;
  const light = state.brightness / 100;
  const left = Math.floor(animation.textX);

  if (effect === "marquee") {
    const color = rgb(settings.color);
    drawText(text, left, () => color, light);
    return;
  }
  if (effect === "gradient") {
    const start = rgb(settings.start);
    const end = rgb(settings.end);
    const colorSpan = Math.max(textWidth(text) - 1, 1);
    const pulse = settings.pulse ? 0.65 + 0.35 * Math.cos(animation.time * 2) : 1;
    drawText(text, left, (x, y) => {
      const ratio = settings.direction === "vertical" ? y / 6 : (x - left) / colorSpan;
      return start.map((component, index) => component + (end[index] - component) * ratio);
    }, light * pulse);
    return;
  }

  const visible = Math.min(text.length, Math.floor(animation.typed) + 1);
  const revealed = text.slice(0, visible);
  const color = rgb(settings.color);
  drawText(revealed, left, () => color, light);
  if (settings.cursor !== "hidden" && animation.time % 0.8 < 0.45) {
    const cursor = { block: [0x7f, 0x7f, 0x7f], underline: [0x40, 0x40, 0x40], star: font["*"] }[settings.cursor];
    const cursorStart = left + visible * 6;
    cursor.forEach((column, offset) => {
      for (let y = 0; y < 7; y++) {
        if (column & (1 << y)) pixel(cursorStart + offset, y, color, light);
      }
    });
  }
}

function paint() {
  if (!context) return;
  context.fillStyle = "#080c09";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#182119";
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      context.fillRect(x * cell + 3, y * cell + 3, 6, 6);
    }
  }

  const display = previewState();
  const text = display.message.toUpperCase();
  if (display.enabled && display.brightness > 0 && text.length) drawEffect(text, display);
}

function animate(timestamp) {
  const elapsed = lastTick === 0 ? 0 : Math.min(0.1, (timestamp - lastTick) / 1000);
  lastTick = timestamp;
  if (!paused) {
    advanceAnimation(previewState(), elapsed);
    if (timestamp - lastPaint >= 16) {
      paint();
      lastPaint = timestamp;
    }
  }
  window.requestAnimationFrame(animate);
}

updateEditor();
window.requestAnimationFrame(animate);
