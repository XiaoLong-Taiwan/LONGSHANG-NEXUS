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
  const targetBaseUrl = readHeader(req.headers["x-ai-gateway-target"]) || process.env.DEFAULT_BACKEND_INTERNAL_URL || "http://api:18437";
  const allowInsecureTls = readHeader(req.headers["x-ai-gateway-insecure-tls"]) === "true";

  if (!Array.isArray(rawPath) || rawPath.length === 0) {
    res.status(400).json({ error: "missing proxy path" });
    return;
  }

  const pathname = "/" + rawPath.join("/");
  const queryString = buildQueryString(req.query);
  const upstream = new URL(pathname + queryString, ensureTrailingSlash(targetBaseUrl));
  const client = upstream.protocol === "https:" ? https : http;

  const headers = { ...req.headers };
  delete headers.host;
  delete headers["content-length"];
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
