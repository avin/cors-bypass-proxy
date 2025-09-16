# CORS Bypass Proxy

A proxy to bypass CORS in the browser.

### Run:
- `npm start`
- Default port: `8080` (override with `PORT`)

### Environment Variables:
- `PORT`: Port for the HTTP server inside the container/process. Default `8080`.
- `CBP_ALLOWED_HOSTS`: Optional allowlist for target hosts. Comma-separated list supporting `*` wildcards.
  - Matching is case-insensitive against the target URL hostname (without port).
  - Patterns are simple globs where `*` matches any sequence of characters.
  - Examples:
    - `CBP_ALLOWED_HOSTS=example.com,*.example.org`
    - `CBP_ALLOWED_HOSTS=api.internal.local,*.svc.cluster.local`
  - Note: `*.example.com` does not match `example.com` itself. Include both if needed.
- `CBP_UPSTREAM_TIMEOUT_MS`: Optional inactivity timeout for the upstream request (client → target).
  - If the target doesn’t send any data for this many milliseconds, the request is aborted.
  - Default: `0` (disabled, no inactivity timeout).
  - Example: `CBP_UPSTREAM_TIMEOUT_MS=120000` for 2 minutes.

### Request:
- `http://<host>:<port>/?__cbp-target=<urlencoded destination http/https URL>`

### Parameters:
- `__cbp-target` — required: urlencoded full http/https URL (with its own query) where the request will be sent
- `__cbp-origin` — optional: overrides `Origin`

### Examples:
```bash
curl "http://localhost:8080/?__cbp-target=https%3A%2F%2Fhttpbin.org%2Fget%3Fa%3D1"

curl -X POST -H "Content-Type: application/json" \
  -d '{"hello":"world"}' \
  "http://localhost:8080/?__cbp-target=https%3A%2F%2Fhttpbin.org%2Fpost"

curl "http://localhost:8080/?__cbp-target=https%3A%2F%2Fhttpbin.org%2Fheaders&__cbp-origin=https%3A%2F%2Fexample.com"
```

Browser:
```js
const t = encodeURIComponent('https://httpbin.org/get?a=1');
fetch(`http://localhost:8080/?__cbp-target=${t}`).then(r => r.json());
```

### Security Notes:
- When `CBP_ALLOWED_HOSTS` is set, requests to targets whose hostname does not match the allowlist are rejected with an error.
- Long-polling or delayed responses: if you saw ~5–6s timeouts before, set `CBP_UPSTREAM_TIMEOUT_MS` (or leave it at `0`) to allow longer waits.
