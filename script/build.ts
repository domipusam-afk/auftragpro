import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile, copyFile, access } from "node:fs/promises";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "axios",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "pdf-lib",
  "passport",
  "passport-local",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
  "swissqrbill",
];

async function buildAll() {
  try { await rm("dist", { recursive: true, force: true }); } catch (_) { /* ignore permission errors on existing dist */ }

  console.log("building client...");
  await viteBuild();

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });

  await copyServerAssets();
}

// Copy server assets (logo, etc.) to dist/ so production build can find them
async function copyServerAssets() {
  const assets = ["schneggenburger-logo.jpg", "fuhrwerk-hintergrund.jpg"];
  for (const asset of assets) {
    const src = `server/${asset}`;
    const dst = `dist/${asset}`;
    try {
      await access(src);
      await copyFile(src, dst);
      console.log(`copied ${src} → ${dst}`);
    } catch {
      console.warn(`asset not found: ${src} (skipping)`);
    }
  }
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
