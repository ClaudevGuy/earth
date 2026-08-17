import { build } from "vite";
import react from "@vitejs/plugin-react";
import esbuild from "esbuild";
import { copyFileSync, cpSync, existsSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "earth-wallet");
const alias = { buffer: "buffer" };

function pageHtml(jsFile, cssFile) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Earth Wallet</title>
    <link rel="stylesheet" href="./${cssFile}" />
  </head>
  <body>
    <div id="root">
      <p style="margin:0;padding:28px 20px;color:#f8f2ea;font-family:Outfit,system-ui,sans-serif;display:flex;align-items:center;gap:12px">
        <img src="./icons/earth-48-transparent.png" width="48" height="48" alt="" />
        Opening Earth Wallet…
      </p>
    </div>
    <script src="./${jsFile}"></script>
  </body>
</html>
`;
}

async function bundleIife(entry, fileName, name, { emptyOutDir = false, cssFileName, react: useReact = false } = {}) {
  await build({
    configFile: false,
    root,
    publicDir: false,
    plugins: useReact ? [react()] : [],
    resolve: { alias },
    build: {
      outDir,
      emptyOutDir,
      sourcemap: false,
      cssCodeSplit: false,
      modulePreload: false,
      rollupOptions: {
        input: { [fileName.replace(/\.js$/, "")]: resolve(root, entry) },
        output: {
          format: "iife",
          name,
          entryFileNames: fileName,
          assetFileNames: cssFileName || "[name][extname]",
          inlineDynamicImports: true,
        },
      },
    },
  });
}

await bundleIife("extension/src/popup/main.tsx", "popup.js", "EarthPopup", {
  emptyOutDir: true,
  cssFileName: "popup.css",
  react: true,
});
await bundleIife("extension/src/approve/main.tsx", "approve.js", "EarthApprove", {
  cssFileName: "approve.css",
  react: true,
});
await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["extension/src/background/index.ts"],
  bundle: true,
  format: "iife",
  outfile: join(outDir, "background.js"),
  platform: "browser",
  target: ["chrome116"],
  legalComments: "none",
  minify: true,
  alias: { buffer: "buffer" },
  define: {
    global: "globalThis",
    "process.env.NODE_ENV": '"production"',
  },
  banner: {
    js: 'if(!("window"in globalThis))globalThis.window=globalThis;if(!("global"in globalThis))globalThis.global=globalThis;',
  },
});
await bundleIife("extension/src/content/index.ts", "content.js", "EarthContent");
await bundleIife("extension/src/inpage/index.ts", "inpage.js", "EarthInpage");

writeFileSync(join(outDir, "popup.html"), pageHtml("popup.js", "popup.css"));
writeFileSync(join(outDir, "approve.html"), pageHtml("approve.js", "approve.css"));
copyFileSync(resolve(root, "extension/manifest.json"), resolve(outDir, "manifest.json"));
cpSync(resolve(root, "extension/icons"), resolve(outDir, "icons"), { recursive: true });

for (const stray of ["_redirects", "favicon.svg", "privacy.html", "assets"]) {
  const path = join(outDir, stray);
  if (existsSync(path)) rmSync(path, { recursive: true, force: true });
}

for (const file of readdirSync(outDir)) {
  if (file.startsWith("bg-") || (file.endsWith(".html") && file !== "popup.html" && file !== "approve.html")) {
    rmSync(join(outDir, file), { recursive: true, force: true });
  }
}

console.log("Earth Wallet unpacked at", outDir);
