"use strict";

const bannerDevice = (() => {
  const hostedOrigin = "https://nsuntch-ui.github.io";
  const hostedPath = "/banner-studio/";
  const color = /^#[0-9a-f]{6}$/i;
  const effects = {
    marquee: { color },
    gradient: { start: color, end: color,
      direction: /^(horizontal|vertical|color-pulse)$/, pulse: /^(true|false)$/ },
    typewriter: { color, cursor: /^(block|underline|star|hidden)$/,
      speed: /^(?:[1-9]|1[0-5])$/ },
    "rainbow-wave": { waveSpeed: /^\d+$/, waveWidth: /^\d+$/, waveSaturation: /^\d+$/,
      waveDirection: /^(left|right)$/ },
    "multi-color": { color1: color, color2: color, color3: color, colorCount: /^[23]$/,
      colorGrouping: /^(letter|word)$/, colorPattern: /^(cycle|mirror)$/ },
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
      enabled: Number(config.enabled), allCaps: Number(config.allCaps ?? true), scrollSpeed: config.motion.speed,
      scrollDirection: config.motion.direction, alignment: config.motion.alignment,
      repeat: config.motion.repeat ?? "continuous", pauseMs: config.motion.pauseMs ?? 1500,
    });
    for (const name of Object.keys(effects[config.effect])) {
      const value = config.settings[name];
      data.set(name, typeof value === "boolean" ? Number(value) : value);
    }
    if (config.effect === "marquee") {
      data.set("colorMode", config.settings.colorMode ?? "solid");
      data.set("colorSpeed", config.settings.colorSpeed ?? 24);
    } else if (config.effect === "gradient") {
      data.set("pulseMs", config.settings.pulseMs ?? 2500);
    } else if (config.effect === "rainbow-wave") {
      data.set("waveAnchor", config.settings.waveAnchor ?? "text");
    }
    return data;
  }

  function range(value, min, max) {
    return Number.isInteger(value) && value >= min && value <= max;
  }

  function interval(value, min, max) {
    return range(value, min, max) && value % 250 === 0;
  }

  function checkState(state) {
    const config = state?.config;
    const motion = config?.motion;
    const settings = config?.settings;
    const spec = config && Object.hasOwn(effects, config.effect) ? effects[config.effect] : null;
    const features = Array.isArray(state?.features) ? state.features : [];
    if (state?.version !== 1 || state.width !== 64 || state.height !== 8 ||
        typeof state.instance !== "string" || !range(state.revision, 0, 4294967295) ||
        !["pending", "saved", "failed"].includes(state.save) ||
        !spec || !settings || !motion || typeof config.message !== "string" ||
        config.message.length > 64 || !/^[A-Za-z0-9 .,!?*:\-]*$/.test(config.message) ||
        typeof config.enabled !== "boolean" || !range(config.brightness, 0, 100) ||
        (config.allCaps !== undefined && typeof config.allCaps !== "boolean") ||
        !range(motion.speed, 0, config.effect === "typewriter" ? 0 : 100) ||
        !["left", "right", "bounce"].includes(motion.direction) ||
        !["left", "center", "right"].includes(motion.alignment) ||
        (features.includes("repeat") &&
          (!["continuous", "pause"].includes(motion.repeat) || !interval(motion.pauseMs, 250, 12000))) ||
        !Object.entries(spec).every(([name, pattern]) => pattern.test(settings[name])) ||
        (config.effect === "marquee" && features.includes("marquee-rainbow") &&
          (!["solid", "rainbow"].includes(settings.colorMode) || !range(settings.colorSpeed, 0, 60))) ||
        (config.effect === "gradient" && typeof settings.pulse !== "boolean") ||
        (config.effect === "gradient" && features.includes("gradient-color-pulse") &&
          !interval(settings.pulseMs, 500, 10000)) ||
        (config.effect === "typewriter" && typeof settings.speed !== "number") ||
        (config.effect === "rainbow-wave" && (!range(settings.waveSpeed, 0, 60) ||
          !range(settings.waveWidth, 8, 64) || !range(settings.waveSaturation, 0, 100) ||
          ((features.includes("rainbow-wave-anchor") || settings.waveAnchor !== undefined) &&
            !["text", "display"].includes(settings.waveAnchor)))) ||
        (config.effect === "multi-color" && !range(settings.colorCount, 2, 3))) {
      throw new Error("This banner returned an unsupported display state.");
    }
    return state;
  }

  async function request(origin, path, options, timeout = 3500) {
    const response = await fetch(origin + path, {
      ...options, credentials: "omit", redirect: "error", cache: "no-store",
      targetAddressSpace: "local", signal: AbortSignal.timeout(timeout),
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

  function handoff(fragment) {
    const params = new URLSearchParams(fragment);
    const origin = address(params.get("banner") ?? "");
    const code = params.get("claim") ?? "";
    return origin && /^[0-9a-f]{32}$/.test(code) ? { origin, code } : null;
  }

  async function appLink(origin) {
    const data = await request(origin, "/api/v1/app-link", {
      method: "POST", headers: { "X-Banner-Local": "1" },
    });
    const url = new URL(data?.url);
    if (url.origin !== hostedOrigin || url.pathname !== hostedPath || url.search ||
        url.username || url.password || !handoff(url.hash.slice(1))) {
      throw new Error("The banner did not return a valid app link.");
    }
    return url.href;
  }

  async function claim(origin, code) {
    const data = await request(origin, "/api/v1/claim", {
      method: "POST", body: new URLSearchParams({ code }),
    }, 30000);
    if (!validKey(data?.key)) throw new Error("The banner did not confirm the connection.");
    return data.key;
  }

  async function localNetworkGranted() {
    for (const name of ["local-network", "local-network-access"]) {
      try {
        const permission = await globalThis.navigator?.permissions?.query({ name });
        if (permission) return permission.state === "granted";
      } catch {}
    }
    return false;
  }

  function get(device, timeout) {
    return request(device.origin, "/api/v1/display", { headers: { "X-Banner-Key": device.key } }, timeout)
      .then(checkState);
  }

  function put(device, base, config) {
    const body = fields(config);
    if (base.config.allCaps === undefined) body.delete("allCaps");
    const features = base.features ?? [];
    if (!features.includes("repeat")) {
      body.delete("repeat");
      body.delete("pauseMs");
    }
    if (!features.includes("marquee-rainbow")) {
      body.delete("colorMode");
      body.delete("colorSpeed");
    }
    if (!features.includes("gradient-color-pulse")) body.delete("pulseMs");
    if (!features.includes("rainbow-wave-anchor")) body.delete("waveAnchor");
    body.set("instance", base.instance);
    body.set("revision", base.revision);
    return request(device.origin, "/api/v1/display", {
      method: "PUT", headers: { "X-Banner-Key": device.key }, body,
    }).then(checkState);
  }

  return { address, fields, validKey, handoff, appLink, claim, localNetworkGranted, pair, get, put };
})();
