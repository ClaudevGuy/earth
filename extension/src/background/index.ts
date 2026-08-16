import "../shared/polyfill";
import nacl from "tweetnacl";
import { PublicKey } from "@solana/web3.js";
import { BUILTIN_TOKENS, CUSTOM_SEED, NATIVE_STANDARDS, findStandard } from "../shared/adapters";
import { AUTO_LOCK_MINUTES, DEFAULT_RPC, WALLET_NAME } from "../shared/constants";
import {
  assertMnemonic,
  createMnemonic,
  decryptVault,
  encryptVault,
  keypairFromMnemonic,
  keypairFromStored,
  serializeSecret,
  type VaultBlob,
} from "../shared/crypto";
import { base64ToBytes, bytesToBase64, parseAmount, shortAddress } from "../shared/format";
import {
  assertHttpsOrigin,
  assertRpcUrl,
  assertUnlockedAllowed,
  clearUnlockFailures,
  recordUnlockFailure,
} from "../shared/security";
import type { PageRequest, PopupRequest, PopupResponse } from "../shared/messages";
import type {
  ActivityItem,
  ConnectedSite,
  ListedToken,
  PendingRequest,
  PublicWalletState,
  TokenBalance,
  TokenStandard,
} from "../shared/types";
import {
  fetchBalances,
  sendFunds,
  signAndSendEncoded,
  signEncodedTransaction,
  simulateEncoded,
  summarizeTransaction,
} from "./chain";

type StoredConfig = {
  vault?: VaultBlob;
  address?: string;
  rpcUrl: string;
  autoLockMinutes: number;
  standards: TokenStandard[];
  tokens: ListedToken[];
  sites: ConnectedSite[];
  activity: ActivityItem[];
};

type Session = {
  secret?: string;
  address?: string;
  pendingMnemonic?: string;
  pendingAddress?: string;
  confirmIndexes?: number[];
  backupConfirmed?: boolean;
};

type Waiter = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

const pendingWaiters = new Map<string, Waiter>();
const pendingRequests = new Map<string, PendingRequest>();
let cachedBalances: TokenBalance[] = [];

const LOCAL_KEY = "earth.wallet.config";
const SESSION_KEY = "earth.wallet.session";

function ok<T>(data: T): PopupResponse<T> {
  return { ok: true, data };
}
function fail(error: unknown): PopupResponse {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

async function loadConfig(): Promise<StoredConfig> {
  const raw = await chrome.storage.local.get(LOCAL_KEY);
  const stored = raw[LOCAL_KEY] as StoredConfig | undefined;
  if (stored && !stored.activity) stored.activity = [];
  return (
    stored ?? {
      rpcUrl: DEFAULT_RPC,
      autoLockMinutes: AUTO_LOCK_MINUTES,
      standards: [...NATIVE_STANDARDS, ...CUSTOM_SEED],
      tokens: [...BUILTIN_TOKENS],
      sites: [],
      activity: [],
    }
  );
}

async function saveConfig(config: StoredConfig): Promise<void> {
  await chrome.storage.local.set({ [LOCAL_KEY]: config });
}

async function loadSession(): Promise<Session> {
  const raw = await chrome.storage.session.get(SESSION_KEY);
  return (raw[SESSION_KEY] as Session | undefined) ?? {};
}

async function saveSession(session: Session): Promise<void> {
  await chrome.storage.session.set({ [SESSION_KEY]: session });
}

function requireKeypair(session: Session) {
  if (!session.secret) throw new Error("Wallet is locked.");
  return keypairFromStored(session.secret);
}

function pickConfirmIndexes(mnemonic: string): number[] {
  const count = mnemonic.split(" ").length;
  const picks = new Set<number>();
  while (picks.size < 3) picks.add(Math.floor(Math.random() * count));
  return [...picks].sort((a, b) => a - b);
}

async function publicState(): Promise<PublicWalletState> {
  const config = await loadConfig();
  const session = await loadSession();
  const unlocked = Boolean(session.secret);
  return {
    hasVault: Boolean(config.vault),
    unlocked,
    address: unlocked ? session.address ?? config.address : undefined,
    rpcUrl: config.rpcUrl,
    autoLockMinutes: config.autoLockMinutes,
    standards: config.standards,
    tokens: config.tokens,
    balances: unlocked ? cachedBalances : [],
    sites: config.sites,
    activity: config.activity ?? [],
    pendingBackup: Boolean(session.pendingMnemonic),
    networkLabel: config.rpcUrl.includes("devnet") ? "devnet" : config.rpcUrl.includes("testnet") ? "testnet" : "mainnet",
    nonCustodial: true,
  };
}

async function refreshBalances(): Promise<TokenBalance[]> {
  const config = await loadConfig();
  const session = await loadSession();
  if (!session.address) {
    cachedBalances = [];
    return cachedBalances;
  }
  cachedBalances = await fetchBalances(config.rpcUrl, session.address, config.standards, config.tokens);
  return cachedBalances;
}

async function scheduleLock(minutes: number): Promise<void> {
  await chrome.alarms.clear("earth-autolock");
  if (minutes > 0) await chrome.alarms.create("earth-autolock", { delayInMinutes: minutes });
}

async function lockWallet(): Promise<void> {
  const session = await loadSession();
  await saveSession({
    pendingMnemonic: session.pendingMnemonic,
    pendingAddress: session.pendingAddress,
    confirmIndexes: session.confirmIndexes,
  });
  cachedBalances = [];
}

async function openApprove(id: string): Promise<void> {
  await chrome.windows.create({
    url: chrome.runtime.getURL(`approve.html?id=${id}`),
    type: "popup",
    width: 380,
    height: 640,
    focused: true,
  });
}

async function requestApproval(partial: Omit<PendingRequest, "id" | "createdAt">): Promise<void> {
  const id = crypto.randomUUID();
  const request: PendingRequest = { ...partial, id, createdAt: Date.now() };
  pendingRequests.set(id, request);
  const approved = await new Promise<boolean>((resolve, reject) => {
    pendingWaiters.set(id, {
      resolve: (value) => resolve(Boolean(value)),
      reject,
    });
    void openApprove(id);
  });
  pendingRequests.delete(id);
  pendingWaiters.delete(id);
  if (!approved) throw new Error("User rejected the request.");
}

function trusted(config: StoredConfig, origin: string): boolean {
  return config.sites.some((site) => site.origin === origin && site.trusted);
}

async function handlePopup(msg: PopupRequest): Promise<PopupResponse> {
  try {
    switch (msg.type) {
      case "GET_STATE": {
        if ((await loadSession()).secret) await scheduleLock((await loadConfig()).autoLockMinutes);
        return ok(await publicState());
      }
      case "PING": {
        const session = await loadSession();
        const config = await loadConfig();
        if (session.secret) await scheduleLock(config.autoLockMinutes);
        return ok({ ok: true });
      }
      case "CREATE_WALLET": {
        const mnemonic = createMnemonic();
        const keypair = keypairFromMnemonic(mnemonic);
        const indexes = pickConfirmIndexes(mnemonic);
        await saveSession({
          pendingMnemonic: mnemonic,
          pendingAddress: keypair.publicKey.toBase58(),
          confirmIndexes: indexes,
        });
        return ok({ mnemonic, address: keypair.publicKey.toBase58(), indexes });
      }
      case "CONFIRM_BACKUP": {
        const session = await loadSession();
        if (!session.pendingMnemonic || !session.confirmIndexes) throw new Error("No seed in progress.");
        const words = session.pendingMnemonic.split(" ");
        const expected = session.confirmIndexes.map((i) => words[i]);
        if (expected.length !== msg.words.length || expected.some((word, i) => word !== msg.words[i]?.trim().toLowerCase())) {
          throw new Error("Those words do not match your seed.");
        }
        await saveSession({ ...session, backupConfirmed: true });
        return ok({ ok: true });
      }
      case "FINISH_CREATE": {
        const session = await loadSession();
        if (!session.pendingMnemonic || !session.pendingAddress) throw new Error("No seed in progress.");
        if (!session.backupConfirmed) throw new Error("Confirm your secret phrase before encrypting the vault.");
        const vault = await encryptVault(msg.password, { mnemonic: session.pendingMnemonic, account: 0 });
        const keypair = keypairFromMnemonic(session.pendingMnemonic);
        const config = await loadConfig();
        config.vault = vault;
        config.address = keypair.publicKey.toBase58();
        await saveConfig(config);
        await saveSession({ secret: serializeSecret(keypair), address: config.address });
        await scheduleLock(config.autoLockMinutes);
        await refreshBalances().catch(() => undefined);
        return ok(await publicState());
      }
      case "IMPORT_WALLET": {
        const mnemonic = assertMnemonic(msg.mnemonic);
        const vault = await encryptVault(msg.password, { mnemonic, account: 0 });
        const keypair = keypairFromMnemonic(mnemonic);
        const config = await loadConfig();
        config.vault = vault;
        config.address = keypair.publicKey.toBase58();
        await saveConfig(config);
        await saveSession({ secret: serializeSecret(keypair), address: config.address });
        await scheduleLock(config.autoLockMinutes);
        await refreshBalances().catch(() => undefined);
        return ok(await publicState());
      }
      case "UNLOCK": {
        await assertUnlockedAllowed();
        const config = await loadConfig();
        if (!config.vault) throw new Error("No wallet on this device.");
        try {
          const payload = await decryptVault(msg.password, config.vault);
          const keypair = keypairFromMnemonic(payload.mnemonic, payload.account);
          await saveSession({ secret: serializeSecret(keypair), address: keypair.publicKey.toBase58() });
          await clearUnlockFailures();
          await scheduleLock(config.autoLockMinutes);
          await refreshBalances().catch(() => undefined);
          return ok(await publicState());
        } catch (error) {
          await recordUnlockFailure();
          throw error;
        }
      }
      case "LOCK":
        await lockWallet();
        return ok(await publicState());
      case "REFRESH":
        await refreshBalances();
        return ok(await publicState());
      case "SEND": {
        const session = await loadSession();
        const config = await loadConfig();
        const keypair = requireKeypair(session);
        const standard = findStandard(msg.standardId, config.standards);
        if (!standard) throw new Error("Unknown token standard.");
        try {
          new PublicKey(msg.to.trim());
        } catch {
          throw new Error("That address is not a valid Solana public key.");
        }
        const token = config.tokens.find((t) => t.mint === msg.mint);
        const listedDecimals = token?.decimals ?? cachedBalances.find((b) => b.mint === msg.mint)?.decimals ?? 0;
        const amount = parseAmount(msg.amount, listedDecimals);
        const signature = await sendFunds({
          rpcUrl: config.rpcUrl,
          keypair,
          to: msg.to.trim(),
          mint: msg.mint,
          amount,
          standard,
          nativeSol: msg.nativeSol,
        });
        config.activity = [
          { signature, summary: `Sent ${msg.amount} ${token?.symbol ?? "token"}`, at: Date.now() },
          ...(config.activity ?? []),
        ].slice(0, 20);
        await saveConfig(config);
        await refreshBalances().catch(() => undefined);
        return ok({ signature });
      }
      case "REGISTER_STANDARD": {
        const config = await loadConfig();
        const id = `std-${crypto.randomUUID()}`;
        const standard: TokenStandard = {
          id,
          name: msg.name.trim(),
          kind: msg.kind,
          programId: msg.programId.trim() || `earthprog:${id}`,
          amountWidth: msg.amountWidth,
          review: "unverified",
          userCreated: true,
          source: "created",
          notes: msg.notes?.trim() || "Registered in Earth Wallet. Unverified — not an audit.",
        };
        if (!standard.name) throw new Error("Give the standard a name.");
        config.standards.push(standard);
        await saveConfig(config);
        return ok(await publicState());
      }
      case "ADOPT_STANDARD": {
        const config = await loadConfig();
        const id = msg.id.trim();
        const programId = msg.programId.trim();
        if (!id || !msg.name.trim() || !programId) throw new Error("That standard is incomplete.");
        if (config.standards.some((s) => s.id === id || s.programId === programId)) {
          return ok(await publicState());
        }
        config.standards.push({
          id,
          name: msg.name.trim(),
          kind: msg.kind,
          programId,
          amountWidth: msg.amountWidth,
          review: "unverified",
          source: "catalog",
          published: true,
          notes: msg.notes?.trim() || "Adopted from the Earth catalog. Unverified — not an audit.",
        });
        await saveConfig(config);
        return ok(await publicState());
      }
      case "ADD_TOKEN": {
        const config = await loadConfig();
        const standard = findStandard(msg.standardId, config.standards);
        if (!standard) throw new Error("Unknown standard.");
        const symbol = msg.symbol.trim().toUpperCase();
        if (!/^[A-Z0-9]{2,12}$/.test(symbol)) throw new Error("Ticker must be 2–12 letters or numbers.");
        const mint = msg.mint.trim() || `earthmint:${symbol.toLowerCase()}:${crypto.randomUUID()}`;
        if (config.tokens.some((t) => t.mint === mint)) throw new Error("That mint is already listed.");
        config.tokens.push({
          mint,
          symbol,
          name: msg.name.trim() || symbol,
          decimals: msg.decimals,
          standardId: msg.standardId,
          tags: ["user"],
        });
        await saveConfig(config);
        await refreshBalances().catch(() => undefined);
        return ok(await publicState());
      }
      case "REMOVE_STANDARD": {
        const config = await loadConfig();
        const standard = findStandard(msg.standardId, config.standards);
        if (!standard?.userCreated && standard?.source !== "catalog") {
          throw new Error("Only user-added standards can be removed.");
        }
        config.standards = config.standards.filter((s) => s.id !== msg.standardId);
        config.tokens = config.tokens.filter((t) => t.standardId !== msg.standardId);
        await saveConfig(config);
        return ok(await publicState());
      }
      case "SET_RPC": {
        const config = await loadConfig();
        config.rpcUrl = assertRpcUrl(msg.url);
        await saveConfig(config);
        await refreshBalances().catch(() => undefined);
        return ok(await publicState());
      }
      case "SET_AUTOLOCK": {
        const config = await loadConfig();
        config.autoLockMinutes = Math.max(0, Math.min(120, msg.minutes));
        await saveConfig(config);
        await scheduleLock(config.autoLockMinutes);
        return ok(await publicState());
      }
      case "EXPORT_SEED": {
        await assertUnlockedAllowed();
        const config = await loadConfig();
        if (!config.vault) throw new Error("No wallet on this device.");
        try {
          const payload = await decryptVault(msg.password, config.vault);
          await clearUnlockFailures();
          return ok({ mnemonic: payload.mnemonic });
        } catch (error) {
          await recordUnlockFailure();
          throw error;
        }
      }
      case "FORGET_SITE": {
        const config = await loadConfig();
        config.sites = config.sites.filter((s) => s.origin !== msg.origin);
        await saveConfig(config);
        return ok(await publicState());
      }
      case "GET_PENDING": {
        const requested = msg.id ? pendingRequests.get(msg.id) : undefined;
        const [first] = pendingRequests.values();
        return ok(requested ?? first ?? null);
      }
      case "RESOLVE_PENDING": {
        const waiter = pendingWaiters.get(msg.id);
        if (!waiter) throw new Error("That request expired. Ask the site to try again.");
        waiter.resolve(msg.approve);
        return ok({ ok: true });
      }
      default:
        throw new Error("Unknown wallet message.");
    }
  } catch (error) {
    return fail(error);
  }
}

async function handlePage(msg: PageRequest): Promise<unknown> {
  const config = await loadConfig();
  const session = await loadSession();
  const origin = msg.origin;
  assertHttpsOrigin(origin);

  switch (msg.method) {
    case "account":
      return trusted(config, origin) && session.address ? session.address : null;
    case "disconnect": {
      config.sites = config.sites.filter((s) => s.origin !== origin);
      await saveConfig(config);
      return true;
    }
    case "connect": {
      if (!config.vault) throw new Error(`${WALLET_NAME} is not set up yet.`);
      if (!session.secret || !session.address) throw new Error("Unlock Earth Wallet to connect.");
      const onlyIfTrusted = Boolean(msg.params?.onlyIfTrusted);
      if (!trusted(config, origin)) {
        if (onlyIfTrusted) return null;
        await requestApproval({
          origin,
          kind: "connect",
          preview: `Connect ${shortAddress(session.address, 6)} to this site.`,
        });
        config.sites = [
          ...config.sites.filter((s) => s.origin !== origin),
          { origin, trusted: true, connectedAt: Date.now() },
        ];
        await saveConfig(config);
      }
      return session.address;
    }
    case "signMessage": {
      if (!trusted(config, origin)) throw new Error("Site is not connected.");
      const keypair = requireKeypair(session);
      const message = String(msg.params?.message ?? "");
      let decoded: string;
      try {
        decoded = new TextDecoder().decode(base64ToBytes(message));
      } catch {
        decoded = message;
      }
      await requestApproval({
        origin,
        kind: "signMessage",
        message: decoded,
        preview: decoded.slice(0, 280),
      });
      const signature = nacl.sign.detached(base64ToBytes(message), keypair.secretKey);
      return {
        signature: bytesToBase64(signature),
        publicKey: keypair.publicKey.toBase58(),
      };
    }
    case "signTransaction": {
      if (!trusted(config, origin)) throw new Error("Site is not connected.");
      const keypair = requireKeypair(session);
      const tx = String(msg.params?.transaction ?? "");
      const simulation = await simulateEncoded(config.rpcUrl, tx).catch((error: unknown) => ({
        ok: false,
        detail: error instanceof Error ? error.message : "Simulation failed",
      }));
      await requestApproval({
        origin,
        kind: "signTransaction",
        preview: summarizeTransaction(tx),
        txCount: 1,
        simulation,
      });
      return signEncodedTransaction(keypair, tx);
    }
    case "signAllTransactions": {
      if (!trusted(config, origin)) throw new Error("Site is not connected.");
      const keypair = requireKeypair(session);
      const txs = (msg.params?.transactions as string[]) ?? [];
      const simulation = txs[0]
        ? await simulateEncoded(config.rpcUrl, txs[0]).catch((error: unknown) => ({
            ok: false,
            detail: error instanceof Error ? error.message : "Simulation failed",
          }))
        : undefined;
      await requestApproval({
        origin,
        kind: "signAllTransactions",
        preview: `${txs.length} transactions`,
        txCount: txs.length,
        simulation,
      });
      const signed: string[] = [];
      for (const tx of txs) signed.push(await signEncodedTransaction(keypair, tx));
      return signed;
    }
    case "signAndSendTransaction": {
      if (!trusted(config, origin)) throw new Error("Site is not connected.");
      const keypair = requireKeypair(session);
      const tx = String(msg.params?.transaction ?? "");
      const simulation = await simulateEncoded(config.rpcUrl, tx).catch((error: unknown) => ({
        ok: false,
        detail: error instanceof Error ? error.message : "Simulation failed",
      }));
      await requestApproval({
        origin,
        kind: "signAndSendTransaction",
        preview: summarizeTransaction(tx),
        txCount: 1,
        simulation,
      });
      return signAndSendEncoded(config.rpcUrl, keypair, tx);
    }
    default:
      throw new Error("Unknown page method.");
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void loadConfig();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "earth-autolock") void lockWallet();
});

chrome.idle.setDetectionInterval(60);
chrome.idle.onStateChanged.addListener((state) => {
  if (state === "locked") void lockWallet();
});

chrome.runtime.onMessage.addListener((message: PopupRequest, sender, sendResponse) => {
  if (sender.id && sender.id !== chrome.runtime.id) return;
  void handlePopup(message).then(sendResponse);
  return true;
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "earth") return;
  const origin = port.sender?.origin ?? port.sender?.url?.replace(/\/$/, "") ?? "";
  port.onMessage.addListener((raw: { id: string; method: PageRequest["method"]; params?: PageRequest["params"] }) => {
    void handlePage({
      type: "PAGE",
      id: raw.id,
      method: raw.method,
      origin: origin || new URL(port.sender?.url ?? "https://unknown.invalid").origin,
      params: raw.params,
    })
      .then((result) => port.postMessage({ id: raw.id, ok: true, result }))
      .catch((error: unknown) =>
        port.postMessage({
          id: raw.id,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
  });
});
