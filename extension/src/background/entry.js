/* Classic service worker entry. Must not use import/export.
   importScripts is only allowed at startup, not inside onMessage. */
try {
  importScripts("background-main.js");
} catch (error) {
  globalThis.__earthEngineError = error instanceof Error ? error.message : String(error);
}

const LOCAL_KEY = "earth.wallet.config";
const SESSION_KEY = "earth.wallet.session";
const DEFAULT_RPC = "https://earth-solana.netlify.app/api/rpc";

function fail(error) {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

function networkLabel(rpcUrl) {
  const url = rpcUrl || "";
  if (url.includes("devnet")) return "devnet";
  if (url.includes("testnet")) return "testnet";
  return "mainnet";
}

async function liteState() {
  const local = await chrome.storage.local.get(LOCAL_KEY);
  const sessionStore = await chrome.storage.session.get(SESSION_KEY);
  const config = local[LOCAL_KEY] || {};
  const session = sessionStore[SESSION_KEY] || {};
  const rpcUrl = config.rpcUrl || DEFAULT_RPC;
  const unlocked = Boolean(session.secret);
  return {
    ok: true,
    data: {
      hasVault: Boolean(config.vault),
      unlocked,
      address: unlocked ? session.address || config.address : undefined,
      rpcUrl,
      autoLockMinutes: config.autoLockMinutes ?? 15,
      catalogUrl: config.catalogUrl || "",
      standards: config.standards || [],
      tokens: config.tokens || [],
      balances: [],
      collectibles: [],
      accounts: [],
      activeAccountId: session.open && session.open.activeId,
      sites: config.sites || [],
      activity: config.activity || [],
      pendingBackup: Boolean(session.pendingMnemonic),
      networkLabel: networkLabel(rpcUrl),
      nonCustodial: true,
    },
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id && sender.id !== chrome.runtime.id) return false;
  if (!message || typeof message !== "object" || !message.type) return false;

  const run = async () => {
    if (typeof globalThis.__earthHandle === "function") {
      return globalThis.__earthHandle(message);
    }
    if (message.type === "GET_STATE" || message.type === "PING") {
      return liteState();
    }
    return fail(globalThis.__earthEngineError || "Wallet engine failed to start.");
  };

  run().then(sendResponse).catch((error) => sendResponse(fail(error)));
  return true;
});
