import { createServer as createHttpServer } from "node:http";
import { Buffer } from "node:buffer";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createServer as createViteServer } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const host = "127.0.0.1";
const port = 5174;

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;

  const content = readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.join(root, ".env"));
loadEnvFile(path.join(root, ".env.local"));

function collectBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function parseQuery(url) {
  const query = {};

  for (const [key, value] of url.searchParams.entries()) {
    if (key in query) {
      const existing = query[key];
      query[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
    } else {
      query[key] = value;
    }
  }

  return query;
}

async function prepareRequest(req, pathname) {
  const url = new URL(req.url || "/", `http://${host}:${port}`);
  const bodyText = await collectBody(req);
  const contentType = req.headers["content-type"] || "";
  let body = undefined;

  if (bodyText) {
    if (contentType.includes("application/json")) {
      body = JSON.parse(bodyText);
    } else {
      body = bodyText;
    }
  }

  req.query = parseQuery(url);
  req.body = body;
  req.url = pathname;
}

function prepareResponse(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };

  res.json = (payload) => {
    if (!res.headersSent) {
      res.setHeader("Content-Type", "application/json");
    }
    res.end(JSON.stringify(payload));
    return res;
  };

  res.send = (payload) => {
    if (Buffer.isBuffer(payload)) {
      res.end(payload);
      return res;
    }

    if (typeof payload === "object" && payload !== null) {
      if (!res.headersSent) {
        res.setHeader("Content-Type", "application/json");
      }
      res.end(JSON.stringify(payload));
      return res;
    }

    res.end(payload ?? "");
    return res;
  };

  return res;
}

async function start() {
  const vite = await createViteServer({
    root,
    server: {
      middlewareMode: true,
      port,
      host
    },
    appType: "spa"
  });

  const server = createHttpServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${host}:${port}`);
    const pathname = url.pathname;

    if (pathname.startsWith("/api/")) {
      try {
        const routeName = pathname.slice("/api/".length);
        const module = await vite.ssrLoadModule(`/api/${routeName}.ts`);
        const handler = module.default;

        if (typeof handler !== "function") {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: "API route not found" }));
          return;
        }

        await prepareRequest(req, pathname);
        prepareResponse(res);
        await handler(req, res);
      } catch (error) {
        vite.ssrFixStacktrace(error);
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            error: error instanceof Error ? error.message : "Local API server error"
          })
        );
      }
      return;
    }

    vite.middlewares(req, res);
  });

  server.listen(port, host, () => {
    console.log(`Admin dev server ready at http://${host}:${port}`);
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
