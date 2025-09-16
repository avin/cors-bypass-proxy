import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';
import { pipeline } from 'node:stream';

const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;

// Optional allowlist for target hosts via env: CBP_ALLOWED_HOSTS
// Comma-separated list; supports '*' wildcards (e.g., "example.com,*.example.org")
const ALLOWED_HOSTS = (process.env.CBP_ALLOWED_HOSTS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function wildcardToRegex(pattern) {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

const ALLOWED_HOSTS_REGEX = ALLOWED_HOSTS.map(wildcardToRegex);

// Do not forward hop-by-hop headers (RFC 7230)
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD');
  const acrh = req.headers['access-control-request-headers'];
  res.setHeader('Access-Control-Allow-Headers', acrh ? acrh : '*');
  res.setHeader('Access-Control-Expose-Headers', '*');
}

function sendError(req, res, status, message, details) {
  try {
    setCorsHeaders(req, res);
  } catch {}
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const body = { error: message };
  if (details) body.details = details;
  res.end(JSON.stringify(body));
}

// Take the target URL ONLY from __cbp-target (no query merging)
function buildTargetUrl(reqUrl) {
  const targetParam = reqUrl.searchParams.get('__cbp-target');
  if (!targetParam) return { error: 'Missing required query parameter __cbp-target' };
  let targetUrl;
  try {
    targetUrl = new URL(targetParam);
  } catch (e) {
    return { error: 'Invalid __cbp-target URL', details: e.message };
  }

  if (!['http:', 'https:'].includes(targetUrl.protocol)) {
    return { error: 'Unsupported __cbp-target protocol. Use http or https.' };
  }

  // Enforce optional host allowlist if configured
  if (ALLOWED_HOSTS_REGEX.length > 0) {
    const host = targetUrl.hostname;
    const allowed = ALLOWED_HOSTS_REGEX.some((rx) => rx.test(host));
    if (!allowed) {
      return {
        error: 'Target host is not allowed by server configuration',
        details: `host: ${host}; allowed: ${ALLOWED_HOSTS.join(', ')}`,
      };
    }
  }
  return { url: targetUrl };
}

// Sanitize outbound headers; optionally override Origin
function sanitizeOutboundHeaders(inboundHeaders, targetUrl, forgedOrigin) {
  const headers = { ...inboundHeaders };

  for (const k of Object.keys(headers)) {
    const lower = k.toLowerCase();
    if (lower !== k) {
      headers[lower] = headers[k];
      delete headers[k];
    }
  }

  for (const h of HOP_BY_HOP_HEADERS) {
    delete headers[h];
  }

  delete headers.host;

  if (forgedOrigin) {
    headers.origin = forgedOrigin;
  }

  return headers;
}

const server = http.createServer((req, res) => {
  let reqUrl;
  try {
    const host = req.headers.host || 'localhost';
    reqUrl = new URL(req.url, `http://${host}`);
  } catch (e) {
    return sendError(req, res, 400, 'Bad request URL', e.message);
  }

  if (req.method === 'OPTIONS') {
    setCorsHeaders(req, res);
    res.statusCode = 204;
    return res.end();
  }

  const { url: targetUrl, error, details } = buildTargetUrl(reqUrl);
  if (!targetUrl) {
    return sendError(req, res, 400, error || 'Invalid __cbp-target', details);
  }

  const forgedOrigin = reqUrl.searchParams.get('__cbp-origin') || undefined;
  const headers = sanitizeOutboundHeaders(req.headers, targetUrl, forgedOrigin);

  const isHttps = targetUrl.protocol === 'https:';
  const requestOptions = {
    protocol: targetUrl.protocol,
    hostname: targetUrl.hostname,
    port: targetUrl.port || (isHttps ? 443 : 80),
    method: req.method,
    path: `${targetUrl.pathname}${targetUrl.search}`,
    headers,
  };

  const proxy = (isHttps ? https : http).request(requestOptions, (upstream) => {
    res.statusCode = upstream.statusCode || 502;
    if (upstream.statusMessage) res.statusMessage = upstream.statusMessage;

    for (const [name, value] of Object.entries(upstream.headers)) {
      const lname = name.toLowerCase();
      if (HOP_BY_HOP_HEADERS.has(lname)) continue;
      if (value !== undefined) res.setHeader(name, value);
    }

    setCorsHeaders(req, res);

    pipeline(upstream, res, (err) => {
      if (err) {
        res.destroy(err);
      }
    });
  });

  proxy.on('timeout', () => {
    proxy.destroy(new Error('Upstream request timeout'));
  });

  proxy.on('error', (err) => {
    if (!res.headersSent) {
      return sendError(req, res, 502, 'Upstream request failed', err.message);
    }
    res.destroy(err);
  });

  if (req.method === 'GET' || req.method === 'HEAD') {
    proxy.end();
  } else {
    pipeline(req, proxy, (err) => {
      if (err) {
        proxy.destroy(err);
      }
    });
  }
});

server.keepAliveTimeout = 60_000;
server.headersTimeout = 65_000;
server.requestTimeout = 60_000;

server.listen(PORT, () => {
  console.log(`CORS Bypass Proxy listening on :${PORT}`);
});
