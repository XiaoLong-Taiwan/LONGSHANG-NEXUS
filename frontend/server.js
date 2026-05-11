const fs = require("fs");
const http = require("http");
const https = require("https");
const next = require("next");

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.FRONTEND_HOST || "0.0.0.0";
const port = Number(process.env.PORT || process.env.FRONTEND_PORT || 8080);
const tlsEnabled = process.env.FRONTEND_TLS_ENABLED === "true";

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const listener = (req, res) => handle(req, res);

  if (tlsEnabled) {
    const keyFile = process.env.FRONTEND_TLS_KEY_FILE;
    const certFile = process.env.FRONTEND_TLS_CERT_FILE;
    if (!keyFile || !certFile) {
      throw new Error("FRONTEND_TLS_ENABLED=true requires FRONTEND_TLS_KEY_FILE and FRONTEND_TLS_CERT_FILE");
    }

    const options = {
      key: fs.readFileSync(keyFile),
      cert: fs.readFileSync(certFile),
    };

    https.createServer(options, listener).listen(port, hostname, () => {
      console.log(`frontend ready on https://${hostname}:${port}`);
    });
    return;
  }

  http.createServer(listener).listen(port, hostname, () => {
    console.log(`frontend ready on http://${hostname}:${port}`);
  });
});
