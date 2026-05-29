import express from 'express';
import type { Express } from 'express';
import fs from "node:fs";
import path from "node:path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // sw.js + manifest.json: NIEMALS cachen, damit neue Versionen sofort wirken
  app.use(['/sw.js', '/manifest.json'], (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  });

  // Static assets (JS/CSS have content-hash in filename → long cache ok)
  app.use(express.static(distPath, { etag: false, lastModified: false }));

  // fall through to index.html — never cache this, so new deploys are picked up immediately
  app.use("/{*path}", (_req, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
