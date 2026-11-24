"use strict";

const bannerDevice = (() => {
  const effects = {
    marquee: { color: /^#[0-9a-f]{6}$/i },
    gradient: { start: /^#[0-9a-f]{6}$/i, end: /^#[0-9a-f]{6}$/i,
      direction: /^(horizontal|vertical)$/, pulse: /^(true|false)$/ },
    typewriter: { color: /^#[0-9a-f]{6}$/i, cursor: /^(block|underline|star|hidden)$/,
      speed: /^(?:[1-9]|1[0-5])$/ },
  };

  function address(value) {
    try {
      const text = value.trim();
      const url = new URL(text.includes("://") ? text : `http://${text}`);
      if (url.protocol !== "http:" || url.port || url.username || url.password ||
          url.pathname !== "/" || url.search || url.hash) return null;
      const host = url.hostname;
      const [first, second] = host.split(".").map(Number);
      const privateIp = /^\d+\.\d+\.\d+\.\d+$/.test(host) && (first === 10 ||
        (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168));
      return privateIp || /^[a-z0-9-]+\.local$/.test(host) ? url.origin : null;
    } catch {
      return null;
    }
  }

  function fields(config) {
    const data = new URLSearchParams({
      message: config.message, effect: config.effect, brightness: config.brightness,
      enabled: Number(config.enabled), scrollSpeed: config.motion.speed,
      scrollDirection: config.motion.direction, alignment: config.motion.alignment,
    });
    for (const name of Object.keys(effects[config.effect])) {
      const value = config.settings[name];
      data.set(name, typeof value === "boolean" ? Number(value) : value);
    }
    return data;
  }

  function range(value, min, max) {
    return Number.isInteger(value) && value >= min && value <= max;
  }

  function checkState(state) {
    const config = state?.config;
    const motion = config?.motion;
    const settings = config?.settings;
    const spec = config && Object.hasOwn(effects, config.effect) ? effects[config.effect] : null;
    if (state?.version !== 1 || state.width !== 64 || state.height !== 8 ||
        typeof state.instance !== "string" || !range(state.revision, 0, 4294967295) ||
        !["pending", "saved", "failed"].includes(state.save) ||
        !spec || !settings || !motion || typeof config.message !== "string" ||
        config.message.length > 64 || !/^[A-Za-z0-9 .,!?*:\-]*$/.test(config.message) ||
        typeof config.enabled !== "boolean" || !range(config.brightness, 0, 100) ||
        !range(motion.speed, 0, config.effect === "typewriter" ? 0 : 100) ||
        !["left", "right", "bounce"].includes(motion.direction) ||
        !["left", "center", "right"].includes(motion.alignment) ||
        !Object.entries(spec).every(([name, pattern]) => pattern.test(settings[name])) ||
        (config.effect === "gradient" && typeof settings.pulse !== "boolean") ||
        (config.effect === "typewriter" && typeof settings.speed !== "number")) {
      throw new Error("This banner returned an unsupported display state.");
    }
    return state;
  }

  async function request(origin, path, options) {
    const response = await fetch(origin + path, {
      ...options, credentials: "omit", redirect: "error", cache: "no-store",
      targetAddressSpace: "local", signal: AbortSignal.timeout(3500),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok && response.status !== 409) {
      const error = new Error(data?.message || "Check that the ESP32 has the live-control firmware.");
      error.status = response.status;
      throw error;
    }
    return data;
  }

  async function pair(origin) {
    const data = await request(origin, "/api/v1/pair", { headers: { "X-Banner-Local": "1" } });
    if (!validKey(data?.key)) throw new Error("The banner did not return a pairing code.");
    return data.key;
  }

  function validKey(key) {
    return typeof key === "string" && /^[0-9a-f]{16}$/i.test(key);
  }

  function get(device) {
    return request(device.origin, "/api/v1/display", { headers: { "X-Banner-Key": device.key } })
      .then(checkState);
  }

  function put(device, base, config) {
    const body = fields(config);
    body.set("instance", base.instance);
    body.set("revision", base.revision);
    return request(device.origin, "/api/v1/display", {
      method: "PUT", headers: { "X-Banner-Key": device.key }, body,
    }).then(checkState);
  }

  return { address, fields, validKey, pair, get, put };
})();
