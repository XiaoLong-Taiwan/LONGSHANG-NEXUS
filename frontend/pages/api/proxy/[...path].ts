import type { NextApiRequest, NextApiResponse } from "next";
import http from "http";
import https from "https";
import { URL } from "url";

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
};

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const rawPath = req.query.path;
  const requestedTarget = readHeader(req.headers["x-ai-gateway-target"]) || process.env.DEFAULT_BACKEND_INTERNAL_URL || "http://api:18437";
  const targetBaseUrl = resolveTargetBaseUrl(requestedTarget, readHeader(req.headers.host));
  const allowInsecureTls = readHeader(req.headers["x-ai-gateway-insecure-tls"]) === "true";

  if (!Array.isArray(rawPath) || rawPath.length === 0) {
    res.status(400).json({ error: "missing proxy path" });
    return;
  }

  const pathname = "/" + rawPath.join("/");
  const queryString = buildQueryString(req.query);
  let upstream: URL;
  try {
    upstream = new URL(pathname + queryString, ensureTrailingSlash(targetBaseUrl));
  } catch {
    res.status(400).json({ error: "invalid backend target", target: targetBaseUrl });
    return;
  }
  const client = upstream.protocol === "https:" ? https : http;

  const headers = { ...req.headers };
  delete headers.host;
  delete headers["content-length"];
  delete headers.origin;
  delete headers.referer;
  delete headers["x-ai-gateway-target"];
  delete headers["x-ai-gateway-insecure-tls"];

  const proxyRequest = client.request(
    {
      protocol: upstream.protocol,
      hostname: upstream.hostname,
      port: upstream.port || (upstream.protocol === "https:" ? 443 : 80),
      path: upstream.pathname + upstream.search,
      method: req.method,
      headers,
      rejectUnauthorized: !allowInsecureTls,
    },
    (proxyResponse) => {
      const contentType = readHeader(proxyResponse.headers["content-type"]);
      if ((proxyResponse.statusCode || 500) >= 400 && contentType.includes("text/html")) {
        const chunks: Buffer[] = [];
        proxyResponse.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        proxyResponse.on("end", () => {
          if (!res.headersSent) {
            res.status(proxyResponse.statusCode || 502).json({
              error: "backend returned an HTML error page",
              status: proxyResponse.statusCode || 502,
              target: targetBaseUrl,
              path: upstream.pathname,
              hint: "Check whether this frontend is proxying to the backend API port, not back to the frontend/admin port.",
            });
          }
        });
        return;
      }

      if (proxyResponse.statusCode) {
        res.statusCode = proxyResponse.statusCode;
      }

      for (const [key, value] of Object.entries(proxyResponse.headers)) {
        if (value !== undefined) {
          res.setHeader(key, value as string | string[]);
        }
      }

      proxyResponse.pipe(res);
    }
  );

  proxyRequest.setTimeout(Number(process.env.PROXY_TIMEOUT_MS || 125000), () => {
    proxyRequest.destroy(new Error("proxy request timed out"));
  });

  proxyRequest.on("error", (error) => {
    if (!res.headersSent) {
      res.status(502).json({
        error: "proxy request failed",
        details: error.message,
        target: targetBaseUrl,
      });
      return;
    }
    res.end();
  });

  req.pipe(proxyRequest);
}

function readHeader(header: string | string[] | undefined): string {
  if (Array.isArray(header)) {
    return header[0] || "";
  }
  return header || "";
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : value + "/";
}

function isSelfTarget(target: string, host: string): boolean {
  if (!target || !host) {
    return false;
  }
  try {
    const parsed = new URL(target);
    const normalizedHost = host.toLowerCase();
    const targetHost = parsed.host.toLowerCase();
    if (targetHost === normalizedHost) {
      return true;
    }
    return (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") &&
      (normalizedHost.startsWith("localhost:") || normalizedHost.startsWith("127.0.0.1:")) &&
      parsed.port === normalizedHost.split(":")[1];
  } catch {
    return false;
  }
}

function resolveTargetBaseUrl(target: string, host: string): string {
  const internal = process.env.DEFAULT_BACKEND_INTERNAL_URL || "http://api:18437";
  if (isSelfTarget(target, host)) {
    return internal;
  }
  try {
    const parsed = new URL(target);
    const backendPort = process.env.BACKEND_PORT || "18437";
    const isLoopback = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    if (process.env.DEFAULT_BACKEND_INTERNAL_URL && isLoopback && (parsed.port === backendPort || parsed.port === "18437")) {
      return internal;
    }
  } catch {
    return target;
  }
  return target;
}

function buildQueryString(query: NextApiRequest["query"]): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (key === "path") {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        params.append(key, item);
      }
      continue;
    }
    if (typeof value === "string") {
      params.append(key, value);
    }
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}
