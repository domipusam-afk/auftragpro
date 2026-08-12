import "dotenv/config";
import express, { Response, NextFunction } from 'express';
import type { Request } from 'express';
import { registerRoutes, markiereAbgelaufeneOfferten } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "node:http";
import { initializeTenantContext, supabaseRequestContext } from "./supabase";
import {
  runWithTenantReadObservation,
  TENANCY_MODE,
  type TenantReadObservation,
} from "./tenant-context";
import { legacySessionContext } from "./legacy-session";
import { supabaseRequestAuthContext } from "./auth-middleware";
import { getAuthMode } from "./auth-context";
import { policyObserver } from "./policy-observer";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: "10mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: false, limit: "10mb" }));
// Etappe 12: Both auth modes remain live runtime switches. Supabase JWT
// verification supplies req.auth before policy enforcement; legacy keeps its
// signed-cookie context. The scoped client then forwards the JWT to PostgREST.
app.use((req, res, next) => getAuthMode() === "legacy"
  ? legacySessionContext(req, res, next)
  : next());
app.use(supabaseRequestAuthContext);
app.use(policyObserver);
app.use(supabaseRequestContext);

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  if (!req.path.startsWith("/api") || TENANCY_MODE !== "observe") {
    next();
    return;
  }

  runWithTenantReadObservation((observation: TenantReadObservation) => {
    res.on("finish", () => {
      console.warn(
        `[TENANCY_OBSERVE] ${req.method} ${req.path}: read_queries=${observation.readQueries} tenant_id_present=${observation.tenantIdPresent} tenant_id_null=${observation.tenantIdNull} tenant_id_unavailable=${observation.tenantIdUnavailable}.`,
      );
    });
    next();
  });
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await initializeTenantContext();
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);

      // ── Keep-Alive Self-Ping (Render Free Tier schläft sonst ein) ──────────
      // Pingt sich selbst alle 9 Minuten, damit der Server wach bleibt.
      // Render Free Tier schläft nach ~15 Min Inaktivität ein.
      if (process.env.NODE_ENV === "production") {
        const RENDER_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`;
        const PING_INTERVAL_MS = 9 * 60 * 1000; // alle 9 Minuten

        setInterval(async () => {
          try {
            const res = await fetch(`${RENDER_URL}/api/ping`);
            log(`Keep-alive ping: ${res.status}`, "keepalive");
          } catch (e: any) {
            log(`Keep-alive ping failed: ${e.message}`, "keepalive");
          }
        }, PING_INTERVAL_MS);

        log(`Keep-alive ping aktiv → ${RENDER_URL}/api/ping (alle 9 Min)`);
      }

      // ── Offerten-Ablauf-Check (täglich) ──────────────────────────────────
      // Setzt offene Offerten mit überschrittener Gültigkeit automatisch auf
      // "abgelaufen". Läuft einmal beim Start und danach alle 24h; zusätzlich
      // wird bei jedem GET /api/offerten ein Check ausgelöst (siehe routes.ts).
      const OFFERTEN_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h
      markiereAbgelaufeneOfferten()
        .then(n => { if (n > 0) log(`${n} Offerte(n) automatisch auf "abgelaufen" gesetzt`, "offerten-check"); })
        .catch(e => log(`Offerten-Ablauf-Check fehlgeschlagen: ${e.message}`, "offerten-check"));
      setInterval(() => {
        markiereAbgelaufeneOfferten()
          .then(n => { if (n > 0) log(`${n} Offerte(n) automatisch auf "abgelaufen" gesetzt`, "offerten-check"); })
          .catch(e => log(`Offerten-Ablauf-Check fehlgeschlagen: ${e.message}`, "offerten-check"));
      }, OFFERTEN_CHECK_INTERVAL_MS);
    },
  );
})();
