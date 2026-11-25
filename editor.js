"use strict";

const width = 64;
const height = 8;
const cell = 12;

const editor = document.querySelector("#editor");
const message = document.querySelector("#message");
const count = document.querySelector("#count");
const messageError = document.querySelector("#message-error");
const brightness = document.querySelector("#brightness");
const allCaps = document.querySelector("#all-caps");
const allCapsOption = document.querySelector("#all-caps-option");
const enabled = document.querySelector("#enabled");
const canvas = document.querySelector("#matrix");
const context = canvas.getContext("2d");
const status = document.querySelector("#status");
const mainConnectionStatus = document.querySelector("#main-connection-status");
const connectionBar = document.querySelector("#connection-bar");
const connectionSource = document.querySelector("#connection-source");
const connection = document.querySelector("#connection");
const retry = document.querySelector("#retry");
const reconnect = document.querySelector("#reconnect");
const pause = document.querySelector("#pause");
const scrollSpeed = document.querySelector("#scroll-speed");
const scrollSpeedValue = document.querySelector("#scroll-speed-value");
const scrollDirection = document.querySelector("#scroll-direction");
const alignment = document.querySelector("#alignment");
const scrollOptions = document.querySelector("#scroll-options");
const scrollDirectionField = document.querySelector("#scroll-direction-field");
const alignmentField = document.querySelector("#alignment-field");
const clipNote = document.querySelector("#clip-note");
const mode = document.querySelector("#mode");
const devicePanel = document.querySelector("#device-panel");
const devicePanelLabel = devicePanel.querySelector("summary");
const deviceForm = document.querySelector("#device-form");
const deviceAddress = document.querySelector("#device-address");
const deviceKey = document.querySelector("#device-key");
const connectButton = document.querySelector("#connect-device");
const deviceFeedback = document.querySelector("#device-feedback");
const deviceSession = document.querySelector("#device-session");
const localPairing = document.querySelector("#local-pairing");
const showPairing = document.querySelector("#show-pairing");
const pairingField = document.querySelector("#pairing-field");
const pairingCode = document.querySelector("#pairing-code");
const simulation = document.querySelector("#simulation");
const settingsButton = document.querySelector("#settings-button");
const settingsDialog = document.querySelector("#settings-dialog");
const settingsClose = document.querySelector("#settings-close");
const layoutTheme = document.querySelector("#layout-theme");
const colorScheme = document.querySelector("#color-scheme");
const localAppLink = document.querySelector("#local-app-link");
const localOrigin = location.protocol === "http:" ? bannerDevice.address(location.origin) : null;
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
let device = null;
let deviceState = null;
let reading = false;
let applying = false;
let sending = null;
let writeError = "";
let localDraftEdited = false;
let localConnectError = false;
let connectError = "";
let openingApp = false;
let pendingHandoff = readHandoff();
let rememberedDevice = readRememberedDevice();
let nextRetry = 0;

function preference(name) {
  try {
    return globalThis.localStorage?.getItem(`banner-studio.${name}`) ?? null;
  } catch {
    return null;
  }
}

function savePreference(name, value) {
  try {
    if (value === null) globalThis.localStorage?.removeItem(`banner-studio.${name}`);
    else globalThis.localStorage?.setItem(`banner-studio.${name}`, value);
  } catch {}
}

function readHandoff() {
  if (location.protocol !== "https:" || !location.hash) return null;
  const handoff = bannerDevice.handoff(location.hash.slice(1));
  if (handoff) history.replaceState(history.state, "", location.pathname + location.search);
  return handoff;
}

function readRememberedDevice() {
  if (location.protocol !== "https:") return null;
  try {
    const saved = JSON.parse(preference("connection"));
    const origin = bannerDevice.address(saved?.origin ?? "");
    const fallback = bannerDevice.address(saved?.fallback ?? "");
    return origin && bannerDevice.validKey(saved?.key) ? { origin, key: saved.key, fallback } : null;
  } catch {
    return null;
  }
}

function rememberDevice(target, state) {
  if (localOrigin || location.protocol !== "https:") return;
  const host = bannerDevice.address(state.host ?? "");
  if (host && host !== target.origin) target.fallback = host;
  const saved = JSON.stringify(target);
  rememberedDevice = { ...target };
  if (saved !== preference("connection")) savePreference("connection", saved);
}

function applyAppearance(control, key) {
  if (!control?.options) return;
  const saved = preference(key);
  if ([...control.options].some(option => option.value === saved)) control.value = saved;
  const update = () => {
    document.documentElement.dataset[key] = control.value;
    savePreference(key, control.value);
  };
  control.addEventListener("change", update);
  update();
}

function openSettings() {
  if (settingsDialog && !settingsDialog.open) settingsDialog.showModal();
}

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
  return { message: message.value, effect, settings, motion, brightness: brightness.valueAsNumber,
    enabled: enabled.checked, allCaps: allCaps?.checked ?? true };
}

function validMessage(value) {
  return value.length <= 64 && /^[A-Za-z0-9 .,!?*:\-]*$/.test(value);
}

function previewState() {
  return validMessage(draft.message) ? draft : applied;
}

function sameConfig(left, right) {
  return bannerDevice.fields(left).toString() === bannerDevice.fields(right).toString();
}

function setControls(config) {
  message.value = config.message;
  brightness.value = config.brightness;
  enabled.checked = config.enabled;
  if (allCaps) allCaps.checked = config.allCaps ?? true;
  editor.querySelector(`input[name=effect][value="${config.effect}"]`).checked = true;
  motionByEffect.set(config.effect, config.motion);
  activeEffect = undefined;
  const panel = effectPanels.find(section => section.dataset.effectPanel === config.effect);
  for (const input of panel.querySelectorAll("[data-setting]")) {
    const value = config.settings[input.dataset.setting];
    if (input.type === "checkbox") input.checked = value;
    else input.value = value;
  }
}

function originHost(origin) {
  try {
    return new URL(origin).host;
  } catch {
    return "";
  }
}

function updateStatus(valid, dirty) {
  mode.textContent = device ? "Banner" : "Simulator";
  const target = pendingHandoff ?? rememberedDevice;
  const host = originHost(device?.origin ?? localOrigin ?? target?.origin);
  let sourceLabel = !online ? "Offline simulation" : location.protocol === "https:" ? "Web app · Not connected" : "Browser only";
  let label = "Simulation only — no banner connected";
  let state = "sim";

  if (device) {
    const channel = localOrigin ? "Direct local" : "Via web app";
    sourceLabel = !online ? `${channel} · Offline` : host ? `${channel} · ${host}` : channel;
    if (!online) {
      label = host ? `Banner offline (${host}) · draft kept` : "Banner offline · draft kept";
      state = "offline";
    } else if (!valid) {
      label = "Message contains unsupported characters";
      state = "draft";
    } else if (waitingForRetry) {
      label = writeError || "Reconnected · draft ready to apply";
      state = "draft";
    } else if (dirty || applying) {
      label = "Sending to banner…";
      state = "draft";
    } else if (deviceState.save === "failed") {
      label = "Live on banner · could not save";
      state = "draft";
    } else if (deviceState.save === "pending") {
      label = "Live on banner · saving…";
      state = "live";
    } else {
      label = localOrigin ? "Live on banner · direct offline-capable" : "Live on banner · saved";
      state = "live";
    }
  } else if (localOrigin) {
    sourceLabel = localConnectError ? "Direct local · Offline" : host ? `Direct local · ${host}` : "Direct local";
    if (localConnectError) {
      label = host ? `Banner offline (${host}) · editing local draft` : "Banner offline · editing local draft";
      state = "offline";
    } else {
      label = "Connecting to local banner…";
      state = "draft";
    }
  } else if (target || connectError) {
    sourceLabel = host ? `Via web app · ${host}` : "Via web app";
    label = connectButton.disabled ? "Connecting to banner…" : connectError ||
      (pendingHandoff ? "Connect to your banner. Chrome may ask for local network access." : "Connect to your saved banner.");
    state = connectError ? "offline" : "draft";
  } else if (!online) {
    label = "Offline simulation · edits previewed as a draft";
    state = "offline";
  } else if (!valid) {
    label = "Message contains unsupported characters";
    state = "draft";
  }

  status.dataset.state = state;
  if (connectionBar) connectionBar.dataset.state = state;
  if (connectionSource && connectionSource.textContent !== sourceLabel) connectionSource.textContent = sourceLabel;
  if (status.textContent !== label) status.textContent = label;
  if (mainConnectionStatus) {
    let brief = "";
    if (!online || localConnectError || connectError) brief = device || localOrigin || target || connectError
      ? "Banner offline" : "Preview offline";
    else if (!device) brief = "Preview only";
    else if (waitingForRetry) brief = "Draft ready in Settings";
    else if (deviceState.save === "failed") brief = "Could not save to banner";
    mainConnectionStatus.hidden = !brief;
    if (mainConnectionStatus.textContent !== brief) mainConnectionStatus.textContent = brief;
  }
  retry.hidden = !online || !waitingForRetry;
  retry.disabled = !valid;
  if (reconnect) {
    reconnect.hidden = device ? online : !target && !localConnectError;
    reconnect.disabled = reading || connectButton.disabled;
    reconnect.textContent = pendingHandoff ? "Connect" : "Reconnect";
  }
  if (localAppLink) localAppLink.disabled = !localOrigin || !device || !online || openingApp;
  if (localOrigin) showPairing.disabled = !device || !online;
  else if (devicePanelLabel) devicePanelLabel.textContent = rememberedDevice ? "Manage banner" : "Pair with a code";
  deviceSession.hidden = !rememberedDevice || Boolean(localOrigin);
}

function updateEditor() {
  const previousEffect = previewState().effect;
  if (allCapsOption) {
    allCapsOption.hidden = Boolean(device && deviceState.config.allCaps === undefined);
    if (allCapsOption.hidden) allCaps.checked = true;
  }
  draft = readEditor();
  const valid = validMessage(draft.message);
  message.setAttribute("aria-invalid", String(!valid));
  messageError.hidden = valid;
  count.value = `${message.value.length} / ${message.maxLength}`;
  document.querySelector("#brightness-value").value = `${draft.brightness}%`;
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

  if (!device && online && !waitingForRetry && valid) applied = draft;
  const dirty = !sameConfig(applied, draft);
  if (!dirty) waitingForRetry = false;
  const canSend = device && online && valid && dirty && !waitingForRetry && !applying && !reading;
  if (!canSend && sending !== null) {
    clearTimeout(sending);
    sending = null;
  }
  if (canSend && sending === null) {
    sending = setTimeout(() => {
      sending = null;
      return applyDeviceDraft();
    }, 150);
  }
  updateStatus(valid, dirty);
  connection.textContent = online ? "Simulate disconnect" : "Simulate reconnect";
  pause.textContent = paused ? "Play preview" : "Pause preview";
  const display = previewState();
  if (display.effect !== previousEffect) animation = startAnimation(display);
  // At zero speed the user controls placement. Resuming starts at that position.
  if (display.motion.speed === 0) animation.textX = alignedTextX(display);
  canvas.setAttribute("aria-label", `64 by 8 preview, ${display.enabled ? display.message : "display off"}`);
  paint();
}

async function applyDeviceDraft() {
  const current = device;
  if (!current || !online || waitingForRetry || applying || reading ||
      !validMessage(draft.message) || sameConfig(draft, applied)) return;
  const submitted = draft;
  applying = true;
  try {
    const result = await bannerDevice.put(current, deviceState, submitted);
    if (device !== current) return;
    deviceState = result;
    applied = result.config;
    if (result.message) {
      waitingForRetry = true;
      writeError = result.message;
    }
  } catch (error) {
    if (device !== current) return;
    online = error.status === 400;
    waitingForRetry = true;
    writeError = online ? error.message : "";
  } finally {
    if (device === current) {
      applying = false;
      updateEditor();
    }
  }
}

async function readDevice() {
  const current = device;
  if (!current || reading || applying) return;
  reading = true;
  const previous = deviceState;
  try {
    const [target, result] = await readTarget(current);
    if (device !== current) return;
    Object.assign(current, target);
    rememberDevice(current, result);
    const dirty = !sameConfig(draft, applied);
    const changed = result.revision !== previous.revision || result.instance !== previous.instance;
    if (dirty && (changed || !online)) {
      waitingForRetry = true;
      writeError = changed ? "Banner settings changed · draft ready to apply" : "";
    } else if (!dirty && changed) {
      setControls(result.config);
    }
    deviceState = result;
    applied = result.config;
    online = true;
  } catch {
    if (device !== current) return;
    online = false;
  } finally {
    if (device === current) {
      reading = false;
      updateEditor();
    }
  }
}

async function readTarget(target, timeout) {
  try {
    return [target, await bannerDevice.get(target, timeout)];
  } catch (error) {
    if (!target.fallback || target.fallback === target.origin) throw error;
    const alternate = { ...target, origin: target.fallback, fallback: target.origin };
    return [alternate, await bannerDevice.get(alternate)];
  }
}

async function connectDevice(origin, key, options = {}) {
  if (connectButton.disabled) return;
  const startingDraft = draft;
  connectButton.disabled = true;
  if (origin === localOrigin) localConnectError = false;
  connectError = "";
  nextRetry = Date.now() + 10000;
  deviceFeedback.textContent = "Connecting to banner…";
  updateEditor();
  try {
    if (options.claim) {
      key = await bannerDevice.claim(origin, options.claim);
      pendingHandoff = null;
      rememberedDevice = { origin, key };
    }
    const [next, result] = await readTarget({
      origin, key: key || await bannerDevice.pair(origin),
      ...(options.fallback ? { fallback: options.fallback } : {}),
    }, options.userGesture ? 30000 : undefined);
    device = next;
    deviceState = result;
    applied = result.config;
    online = true;
    localConnectError = false;
    pendingHandoff = null;
    rememberDevice(next, result);
    const keepDraft = localDraftEdited || !sameConfig(startingDraft, draft);
    localDraftEdited = false;
    waitingForRetry = keepDraft;
    writeError = keepDraft ? "Connected · draft ready to apply" : "";
    if (!keepDraft) setControls(result.config);
    deviceKey.value = "";
    deviceForm.hidden = true;
    simulation.hidden = true;
    devicePanel.open = false;
    deviceFeedback.textContent = "";
    if (options.userGesture && settingsDialog?.open) settingsDialog.close();
  } catch (error) {
    connectError = error instanceof TypeError || error.name === "TimeoutError"
      ? "Couldn’t reach the banner. Join home Wi-Fi and allow local network access in Chrome."
      : error.message;
    deviceFeedback.textContent = connectError;
    if (origin === localOrigin && !device) localConnectError = true;
    if ((options.claim && error.status === 403) || error.status === 401) {
      pendingHandoff = null;
      if (error.status === 401) {
        rememberedDevice = null;
        savePreference("connection", null);
      }
    }
  } finally {
    connectButton.disabled = false;
    updateEditor();
  }
}

function disconnectDevice() {
  device = null;
  deviceState = null;
  applying = false;
  reading = false;
  online = true;
  localConnectError = false;
  connectError = "";
  waitingForRetry = false;
  writeError = "";
  rememberedDevice = null;
  pendingHandoff = null;
  savePreference("connection", null);
  deviceForm.hidden = false;
  deviceSession.hidden = true;
  simulation.hidden = false;
  deviceFeedback.textContent = "";
  updateEditor();
}

function connectKnownBanner(userGesture) {
  if (device) return readDevice();
  if (localOrigin) return connectDevice(localOrigin);
  if (pendingHandoff) {
    return connectDevice(pendingHandoff.origin, null, { claim: pendingHandoff.code, userGesture });
  }
  if (rememberedDevice) {
    return connectDevice(rememberedDevice.origin, rememberedDevice.key, {
      fallback: rememberedDevice.fallback, userGesture,
    });
  }
}

async function pollConnection() {
  if (device) return readDevice();
  if (location.protocol === "https:" && (rememberedDevice || pendingHandoff) &&
      !connectButton.disabled && Date.now() >= nextRetry && await bannerDevice.localNetworkGranted()) {
    await connectKnownBanner(false);
  }
}

editor.addEventListener("submit", event => event.preventDefault());
editor.addEventListener("input", () => {
  if (!device && (localOrigin || rememberedDevice || pendingHandoff)) localDraftEdited = true;
  updateEditor();
});
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
  writeError = "";
  updateEditor();
});
if (reconnect) {
  reconnect.addEventListener("click", () => connectKnownBanner(true));
}
deviceForm.addEventListener("submit", event => {
  event.preventDefault();
  const origin = bannerDevice.address(deviceAddress.value);
  const key = deviceKey.value.trim().toLowerCase();
  if (!origin || !bannerDevice.validKey(key)) {
    deviceFeedback.textContent = "Enter a local banner address and the 16-character pairing code.";
    return;
  }
  connectDevice(origin, key, { userGesture: true });
});
settingsButton?.addEventListener("click", openSettings);
settingsClose?.addEventListener("click", () => settingsDialog.close());
localAppLink?.addEventListener("click", async () => {
  if (!localOrigin || !device || !online || openingApp) return;
  openingApp = true;
  localAppLink.disabled = true;
  try {
    location.assign(await bannerDevice.appLink(localOrigin));
  } catch {
    deviceFeedback.textContent = "Couldn’t open the web app. Try again or show the pairing code.";
    openingApp = false;
    localAppLink.disabled = false;
  }
});
document.querySelector("#disconnect-device").addEventListener("click", disconnectDevice);
showPairing.addEventListener("click", () => {
  const visible = pairingField.hidden;
  pairingField.hidden = !visible;
  pairingCode.value = visible ? device?.key ?? "" : "";
  showPairing.textContent = visible ? "Hide pairing code" : "Show pairing code";
  if (visible) pairingCode.select();
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
    const glyph = bannerFont[text[index]] ?? bannerFont["?"];
    for (let x = 0; x < glyph.length; x++) {
      for (let y = 0; y < height; y++) {
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
      const ratio = settings.direction === "vertical" ? Math.min(y / 6, 1) : (x - left) / colorSpan;
      return start.map((component, index) => component + (end[index] - component) * ratio);
    }, light * pulse);
    return;
  }

  const visible = Math.min(text.length, Math.floor(animation.typed) + 1);
  const revealed = text.slice(0, visible);
  const color = rgb(settings.color);
  drawText(revealed, left, () => color, light);
  if (settings.cursor !== "hidden" && animation.time % 0.8 < 0.45) {
    const cursor = { block: [0x7f, 0x7f, 0x7f], underline: [0x40, 0x40, 0x40], star: bannerFont["*"] }[settings.cursor];
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
  const text = display.allCaps ? display.message.toUpperCase() : display.message;
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

applyAppearance(layoutTheme, "layout");
applyAppearance(colorScheme, "palette");
updateEditor();
if (localOrigin) {
  devicePanel.hidden = false;
  localPairing.hidden = false;
  deviceForm.hidden = true;
  devicePanel.querySelector("summary").textContent = "Pair the installed app";
  showPairing.disabled = true;
  connectDevice(localOrigin);
} else if (location.protocol === "https:") {
  devicePanel.hidden = false;
  if (pendingHandoff) {
    bannerDevice.localNetworkGranted().then(granted => {
      if (granted) connectKnownBanner(false);
      else openSettings();
    });
  } else {
    pollConnection();
  }
}
setInterval(pollConnection, 2500);
window.requestAnimationFrame(animate);
