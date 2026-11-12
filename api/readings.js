// api/readings.js — Vercel serverless function that reads the ESP32 DHT22 API.
//
// The browser can't fetch the sensor directly: Vercel serves this site over
// HTTPS, and browsers block an HTTPS page from calling a plain-HTTP address
// (mixed content). So the page asks this function instead, and the function
// makes the request server-side.
//
// Configure the sensor with the DEVICE_URL environment variable, e.g.
//   DEVICE_URL = http://10.243.1.57/device/readings
//
// Note: a Vercel function runs in the cloud and can only reach DEVICE_URL if
// that URL is reachable from the public internet (a tunnel such as
// `cloudflared tunnel --url http://<board-ip>` is the usual way to expose the
// board). For a board on the same Wi-Fi as you, run the app locally instead.

const DEFAULT_PATH = "/device/readings";
const TIMEOUT_MS = 5000;

function deviceUrl() {
  const configured = (process.env.DEVICE_URL || "").trim();
  if (!configured) return null;
  // Accept either a host (10.0.0.5) or a full URL.
  const withScheme = /^https?:\/\//i.test(configured)
    ? configured
    : `http://${configured}`;
  try {
    const url = new URL(withScheme);
    if (url.pathname === "/" || url.pathname === "") {
      url.pathname = DEFAULT_PATH;
    }
    return url;
  } catch {
    return null;
  }
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.end(JSON.stringify(body));
}

function number(value) {
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(n) ? n : null;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    send(res, 405, { error: "method_not_allowed" });
    return;
  }

  const url = deviceUrl();
  if (!url) {
    send(res, 503, {
      error: "device_not_configured",
      detail: "Set DEVICE_URL to the ESP32 readings URL.",
    });
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
      cache: "no-store",
    });
  } catch (error) {
    const timedOut = error && error.name === "AbortError";
    send(res, 502, {
      error: timedOut ? "device_timeout" : "device_unreachable",
      detail: timedOut
        ? `No response within ${TIMEOUT_MS / 1000}s.`
        : "Could not connect to DEVICE_URL.",
    });
    return;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    send(res, 502, {
      error: "device_unreachable",
      detail: `Sensor replied ${response.status}.`,
    });
    return;
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    send(res, 502, { error: "bad_response", detail: "Sensor sent invalid JSON." });
    return;
  }

  const temperature = number(payload && payload.temperature_c);
  const humidity = number(payload && payload.humidity_pct);

  if (temperature === null || humidity === null) {
    send(res, 502, {
      error: "bad_response",
      detail: "Response is missing temperature_c or humidity_pct.",
    });
    return;
  }

  send(res, 200, {
    temperature_c: temperature,
    humidity_pct: humidity,
    device: typeof payload.device === "string" ? payload.device : undefined,
    sensor: typeof payload.sensor === "string" ? payload.sensor : undefined,
    ip: typeof payload.ip === "string" ? payload.ip : undefined,
    fetched_at: new Date().toISOString(),
  });
};
