import { build } from "vite";
import react from "@vitejs/plugin-react";
import { copyFileSync, cpSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "earth-wallet");
const alias = { buffer: "buffer" };
const define = { global: "globalThis" };

await build({
  configFile: false,
  root: resolve(root, "extension"),
  base: "./",
  publicDir: false,
  plugins: [react()],
  define,
  resolve: { alias },
  build: {
    outDir,
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        popup: resolve(root, "extension/popup.html"),
        approve: resolve(root, "extension/approve.html"),
      },
    },
  },
});

async function bundleIife(entry, fileName, name) {
  await build({
    configFile: false,
    root,
    publicDir: false,
    define,
    resolve: { alias },
    build: {
      outDir,
      emptyOutDir: false,
      sourcemap: false,
      rollupOptions: {
        input: { [fileName.replace(/\.js$/, "")]: resolve(root, entry) },
        output: {
          format: "iife",
          name,
          entryFileNames: fileName,
          inlineDynamicImports: true,
        },
      },
    },
  });
}

await bundleIife("extension/src/background/index.ts", "background.js", "EarthBackground");
await bundleIife("extension/src/content/index.ts", "content.js", "EarthContent");
await bundleIife("extension/src/inpage/index.ts", "inpage.js", "EarthInpage");

copyFileSync(resolve(root, "extension/manifest.json"), resolve(outDir, "manifest.json"));
cpSync(resolve(root, "extension/icons"), resolve(outDir, "icons"), { recursive: true });

for (const file of readdirSync(outDir)) {
  if (file.endsWith(".html")) {
    const path = join(outDir, file);
    const html = readFileSync(path, "utf8").replace(/ crossorigin/g, "");
    writeFileSync(path, html);
  }
}

for (const stray of ["_redirects", "favicon.svg", "privacy.html"]) {
  const path = join(outDir, stray);
  if (existsSync(path)) rmSync(path);
}

console.log("Earth Wallet unpacked at", outDir);
