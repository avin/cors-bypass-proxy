# CORS Bypass Proxy

A proxy to bypass CORS in the browser.

### Run:
- `npm start`
- Default port: `8080` (override with `PORT`)

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
