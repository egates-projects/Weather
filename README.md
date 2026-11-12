# Weather

A small Vercel app that shows the current temperature and humidity from the
DHT22 sensor on the ESP32. The page refreshes every 30 seconds and keeps the
last good reading on screen if the sensor goes quiet.

```
index.html        the page
styles.css        styling (light and dark)
app.js            polling, formatting, connection states
api/readings.js   serverless function that asks the ESP32 for a reading
```

There is no build step: Vercel serves the three static files and turns
`api/readings.js` into a Node function.

## How it works

The ESP32 runs `dht22-api.py`, which answers `GET /device/readings` with:

```json
{"device": "esp32-dht22", "sensor": "DHT22",
 "temperature_c": 22.6, "humidity_pct": 41.3, "ip": "10.243.1.57"}
```

The browser can't call that address directly. Vercel serves the page over
HTTPS, and browsers refuse to let an HTTPS page fetch a plain-HTTP URL
("mixed content"). So the page calls `/api/readings`, and the function makes
the request for it.

## Deploying

1. Import this repository at <https://vercel.com/new>.
2. Leave the framework preset as **Other** and the build command empty —
   there is nothing to build.
3. Add an environment variable:

   | Name         | Value                                  |
   |--------------|----------------------------------------|
   | `DEVICE_URL` | `http://10.243.1.57/device/readings`   |

   A bare host such as `10.243.1.57` also works; `/device/readings` is added
   for you.
4. Deploy.

### One catch: the sensor is on a private network

`10.243.1.57` is a Tufts_Wireless address. Vercel's functions run in the
cloud, so they cannot reach it — the page will say *"Can't reach the
sensor."* That is expected, not a bug in the app.

To get live data on the deployed site, give the board a public address with a
tunnel and point `DEVICE_URL` at that instead:

```sh
cloudflared tunnel --url http://10.243.1.57
# then DEVICE_URL = https://<random>.trycloudflare.com/device/readings
```

The board itself has no authentication, so keep any tunnel URL private, or
only run it while you're watching. Otherwise, run the app on the same Wi-Fi:

```sh
npx vercel dev      # http://localhost:3000, reads DEVICE_URL from .env.local
```

## Before the board can answer

The ESP32 currently runs the jack-o'-lantern program. Put the sensor API on
it instead:

```sh
./upload.sh dht22-api.py
```

The board's station MAC (`14:33:5C:DF:73:84`) must be registered at
<https://device-registration.it.tufts.edu> before it gets an IP.

## The API function

`GET /api/readings` returns the reading, or a JSON error the page knows how
to explain:

| Status | `error`                 | Meaning                              |
|--------|-------------------------|--------------------------------------|
| 200    | —                       | `{temperature_c, humidity_pct, …}`   |
| 502    | `device_unreachable`    | Could not connect to `DEVICE_URL`    |
| 502    | `device_timeout`        | No answer within 5 seconds           |
| 502    | `bad_response`          | Invalid JSON, or missing fields      |
| 503    | `device_not_configured` | `DEVICE_URL` is not set              |

`temperature_c` and `humidity_pct` are always numbers on a 200; anything else
is reported as `bad_response`. Responses are sent with `Cache-Control:
no-store` so every page load asks the sensor again.
