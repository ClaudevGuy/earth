import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const zip = resolve(root, "earth-wallet.zip");
const dir = resolve(root, "earth-wallet");

if (!existsSync(dir)) {
  throw new Error("Run npm run ext:build first.");
}
if (existsSync(zip)) rmSync(zip);

const result = spawnSync(
  "powershell",
  ["-NoProfile", "-Command", `Compress-Archive -Path "${dir}\\*" -DestinationPath "${zip}" -Force`],
  { stdio: "inherit" },
);

if (result.status !== 0) {
  throw new Error("Failed to zip earth-wallet");
}

console.log("Chrome Web Store zip:", zip);
