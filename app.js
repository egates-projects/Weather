// app.js — polls /api/readings and paints the current temperature and humidity.

const REFRESH_MS = 30_000;

const els = {
  body: document.body,
  temperature: document.getElementById("temperature"),
  temperatureDetail: document.getElementById("temperature-detail"),
  humidity: document.getElementById("humidity"),
  humidityDetail: document.getElementById("humidity-detail"),
  status: document.getElementById("status"),
  updated: document.getElementById("updated"),
  refresh: document.getElementById("refresh"),
};

const ERROR_TEXT = {
  device_not_configured:
    "Sensor URL not set — add DEVICE_URL to the Vercel project.",
  device_timeout: "The sensor didn't answer in time.",
  device_unreachable: "Can't reach the sensor.",
  sensor_read_failed: "The DHT22 couldn't take a reading.",
  bad_response: "The sensor sent an unexpected response.",
};

let inFlight = false;
let timer = null;
let lastReadingAt = 0;

function toFahrenheit(celsius) {
  return celsius * (9 / 5) + 32;
}

function comfortFor(humidity) {
  if (humidity < 30) return "Dry";
  if (humidity <= 60) return "Comfortable";
  return "Humid";
}

function renderReading(data) {
  const celsius = data.temperature_c;
  const humidity = data.humidity_pct;

  els.temperature.textContent = celsius.toFixed(1);
  els.temperatureDetail.textContent = `${toFahrenheit(celsius).toFixed(1)} °F`;
  els.humidity.textContent = humidity.toFixed(1);
  els.humidityDetail.textContent = comfortFor(humidity);

  els.body.dataset.hasReading = "true";
  lastReadingAt = Date.now();
}

function setState(state, message, detail) {
  els.body.dataset.state = state;
  els.status.textContent = message;
  els.status.title = detail || "";

  if (lastReadingAt) {
    const time = new Date(lastReadingAt).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    els.updated.textContent =
      state === "ok" ? `Updated ${time}` : `Last reading ${time}`;
  }
}

function showError(code, detail) {
  setState("error", ERROR_TEXT[code] || "Couldn't load a reading.", detail);
}

async function load() {
  if (inFlight) return;

  inFlight = true;
  els.refresh.disabled = true;
  els.body.dataset.state = "loading";
  els.status.textContent = lastReadingAt ? "Refreshing…" : "Connecting…";

  try {
    const res = await fetch(`/api/readings?t=${Date.now()}`, {
      cache: "no-store",
      headers: { accept: "application/json" },
    });

    let payload = null;
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }

    if (!res.ok) {
      showError(payload && payload.error, payload && payload.detail);
      return;
    }

    if (
      !payload ||
      !Number.isFinite(payload.temperature_c) ||
      !Number.isFinite(payload.humidity_pct)
    ) {
      showError("bad_response");
      return;
    }

    renderReading(payload);
    setState("ok", "Connected");
  } catch (error) {
    // Offline, DNS failure, or a request that never completed.
    showError("device_unreachable", String(error));
  } finally {
    inFlight = false;
    els.refresh.disabled = false;
  }
}

function startPolling() {
  clearInterval(timer);
  timer = setInterval(() => {
    if (!document.hidden) load();
  }, REFRESH_MS);
}

els.refresh.addEventListener("click", load);

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && Date.now() - lastReadingAt > REFRESH_MS) {
    load();
  }
});

load();
startPolling();
