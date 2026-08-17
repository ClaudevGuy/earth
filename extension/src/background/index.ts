import "../shared/polyfill";
import nacl from "tweetnacl";
import { BUILTIN_TOKENS, CUSTOM_SEED, NATIVE_STANDARDS, findStandard } from "../shared/adapters";
import { AUTO_LOCK_MINUTES, DEFAULT_RPC, WALLET_NAME, resolveRpcUrl } from "../shared/constants";
import { canonicalStandardId } from "../shared/standardId";
import {
  assertMnemonic,
  createMnemonic,
  decryptVault,
  encryptVault,
  keypairForAccount,
  keypairFromMnemonic,
  keypairFromStored,
  nextDerivedIndex,
  normalizeVault,
  serializeSecret,
  toVaultPayload,
  type OpenVault,
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
  Collectible,
  ConnectedSite,
  ListedToken,
  PendingRequest,
  PublicWalletState,
  TokenBalance,
  TokenStandard,
  WalletAccountInfo,
} from "../shared/types";
import { resolveStandardById } from "./catalog";
import {
  sendFunds,
  signAndSendEncoded,
  signEncodedTransaction,
  simulateEncoded,
  summarizeTransaction,
} from "./chain";
import { fetchHoldings } from "./holdings";

type StoredConfig = {
  vault?: VaultBlob;
  address?: string;
  rpcUrl: string;
  catalogUrl: string;
  autoLockMinutes: number;
  standards: TokenStandard[];
  tokens: ListedToken[];
  sites: ConnectedSite[];
  activity: ActivityItem[];
};

type Session = {
  secret?: string;
  address?: string;
  password?: string;
  open?: OpenVault;
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
let cachedCollectibles: Collectible[] = [];
let cachedDomain: string | undefined;

const LOCAL_KEY = "earth.wallet.config";
const SESSION_KEY = "earth.wallet.session";

function ok<T>(data: T): PopupResponse<T> {
  return { ok: true, data };
}
function fail(error: unknown): PopupResponse {
  const raw = error instanceof Error ? error.message : String(error);
  if (/invalid public key input/i.test(raw)) {
    return {
      ok: false,
      error: "That's not a seed phrase. Paste the 12 or 24 words from Phantom or Solflare, not the wallet address.",
    };
  }
  return { ok: false, error: raw };
}

async function loadConfig(): Promise<StoredConfig> {
  const raw = await chrome.storage.local.get(LOCAL_KEY);
  const stored = raw[LOCAL_KEY] as StoredConfig | undefined;
  if (stored && !stored.activity) stored.activity = [];
  if (stored && stored.catalogUrl == null) stored.catalogUrl = "";
  const config =
    stored ?? {
      rpcUrl: DEFAULT_RPC,
      catalogUrl: "",
      autoLockMinutes: AUTO_LOCK_MINUTES,
      standards: [...NATIVE_STANDARDS, ...CUSTOM_SEED],
      tokens: [...BUILTIN_TOKENS],
      sites: [],
      activity: [],
    };
  const rpcUrl = resolveRpcUrl(config.rpcUrl);
  const beforeIds = (stored?.standards ?? []).map((s) => s.programId).join("|");
  config.rpcUrl = rpcUrl;
  const seeded = [...NATIVE_STANDARDS, ...CUSTOM_SEED];
  const ids = new Set(config.standards.map((s) => canonicalStandardId(s.id)));
  config.standards = config.standards.map((s) => {
    const id = canonicalStandardId(s.id);
    const fresh = seeded.find((row) => row.id === id);
    if (fresh && !s.userCreated) {
      return { ...s, id, name: fresh.name, programId: fresh.programId, notes: fresh.notes, factory: fresh.factory };
    }
    return { ...s, id };
  });
  config.tokens = config.tokens.map((t) => ({ ...t, standardId: canonicalStandardId(t.standardId) }));
  for (const row of seeded) {
    if (!ids.has(row.id)) {
      config.standards.push(row);
      ids.add(row.id);
    }
  }
  const afterIds = config.standards.map((s) => s.programId).join("|");
  if (!stored || stored.rpcUrl !== config.rpcUrl || beforeIds !== afterIds) {
    await chrome.storage.local.set({ [LOCAL_KEY]: config });
  }
  return config;
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

function accountInfos(open: OpenVault): WalletAccountInfo[] {
  return open.accounts.map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind,
    address: keypairForAccount(open.mnemonic, row).publicKey.toBase58(),
  }));
}

function requireOpen(session: Session): { open: OpenVault; password: string } {
  if (!session.open || !session.password) throw new Error("Unlock Earth Wallet first.");
  return { open: session.open, password: session.password };
}

async function persistOpen(config: StoredConfig, password: string, open: OpenVault): Promise<void> {
  config.vault = await encryptVault(password, toVaultPayload(open));
  await saveConfig(config);
}

async function activateOpen(
  config: StoredConfig,
  password: string,
  open: OpenVault,
  persistVault = true,
): Promise<void> {
  const account = open.accounts.find((row) => row.id === open.activeId) ?? open.accounts[0];
  if (!account) throw new Error("No wallet on this device.");
  const keypair = keypairForAccount(open.mnemonic, account);
  config.address = keypair.publicKey.toBase58();
  if (persistVault) await persistOpen(config, password, open);
  else await saveConfig(config);
  await saveSession({
    secret: serializeSecret(keypair),
    address: config.address,
    password,
    open,
  });
  await scheduleLock(config.autoLockMinutes);
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
    catalogUrl: config.catalogUrl ?? "",
    standards: config.standards,
    tokens: config.tokens,
    balances: unlocked ? cachedBalances : [],
    collectibles: unlocked ? cachedCollectibles : [],
    accounts: session.open ? accountInfos(session.open) : [],
    activeAccountId: session.open?.activeId,
    solDomain: unlocked ? cachedDomain : undefined,
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
    cachedCollectibles = [];
    cachedDomain = undefined;
    return cachedBalances;
  }
  const holdings = await fetchHoldings(config.rpcUrl, session.address, config.standards, config.tokens);
  cachedBalances = holdings.tokens;
  cachedCollectibles = holdings.collectibles;
  cachedDomain = undefined;
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
    backupConfirmed: session.backupConfirmed,
  });
  cachedBalances = [];
  cachedCollectibles = [];
  cachedDomain = undefined;
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
        const open = normalizeVault({ mnemonic: session.pendingMnemonic, account: 0 });
        const config = await loadConfig();
        await activateOpen(config, msg.password, open);
        return ok(await publicState());
      }
      case "IMPORT_WALLET": {
        const mnemonic = assertMnemonic(msg.mnemonic);
        const open = normalizeVault({ mnemonic, account: 0 });
        const config = await loadConfig();
        await activateOpen(config, msg.password, open);
        void refreshBalances().catch(() => undefined);
        return ok(await publicState());
      }
      case "UNLOCK": {
        await assertUnlockedAllowed();
        const config = await loadConfig();
        if (!config.vault) throw new Error("No wallet on this device.");
        try {
          const payload = await decryptVault(msg.password, config.vault);
          const open = normalizeVault(payload);
          await clearUnlockFailures();
          await activateOpen(config, msg.password, open, !payload.accounts?.length);
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
        const to = msg.to.trim();
        if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(to)) {
          throw new Error("That address is not a valid Solana public key.");
        }
        const listed = config.tokens.find((t) => t.mint === msg.mint);
        const held = cachedBalances.find((b) => b.mint === msg.mint);
        const decimals = listed?.decimals ?? held?.decimals ?? (msg.nativeSol ? 9 : 0);
        const amount = parseAmount(msg.amount, decimals);
        const standard = findStandard(msg.standardId, config.standards);
        if (!standard) throw new Error("Unknown token standard.");
        const signature = await sendFunds({
          rpcUrl: config.rpcUrl,
          keypair: requireKeypair(session),
          to,
          mint: msg.mint,
          amount,
          standard,
          nativeSol: Boolean(msg.nativeSol),
        });
        config.activity = [
          { signature, summary: `Sent ${msg.amount} ${listed?.symbol ?? held?.symbol ?? "token"}`, at: Date.now() },
          ...(config.activity ?? []),
        ].slice(0, 20);
        await saveConfig(config);
        await refreshBalances().catch(() => undefined);
        return ok({ signature });
      }
      case "IMPORT_STANDARD": {
        const config = await loadConfig();
        const standard = await resolveStandardById(msg.id, {
          catalogUrl: config.catalogUrl,
          trustedOrigins: config.sites.map((site) => site.origin),
        });
        const existing = config.standards.find(
          (row) => row.id === standard.id || row.programId === standard.programId,
        );
        if (!existing) {
          config.standards.push({ ...standard, userCreated: standard.source === "catalog" });
          await saveConfig(config);
        }
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
      case "SET_CATALOG": {
        const config = await loadConfig();
        config.catalogUrl = msg.url.trim() ? assertRpcUrl(msg.url) : "";
        await saveConfig(config);
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
        const session = await loadSession();
        if (!config.vault) throw new Error("No wallet on this device.");
        try {
          const open = normalizeVault(await decryptVault(msg.password, config.vault));
          await clearUnlockFailures();
          const active = open.accounts.find((row) => row.id === (session.open?.activeId ?? open.activeId)) ?? open.accounts[0];
          return ok({ mnemonic: active?.kind === "imported" && active.mnemonic ? active.mnemonic : open.mnemonic });
        } catch (error) {
          await recordUnlockFailure();
          throw error;
        }
      }
      case "SWITCH_ACCOUNT": {
        const session = await loadSession();
        const { open, password } = requireOpen(session);
        if (!open.accounts.some((row) => row.id === msg.id)) throw new Error("Unknown wallet.");
        open.activeId = msg.id;
        const config = await loadConfig();
        await activateOpen(config, password, open);
        return ok(await publicState());
      }
      case "ADD_ACCOUNT": {
        const session = await loadSession();
        const { open, password } = requireOpen(session);
        const index = nextDerivedIndex(open.accounts);
        const id = crypto.randomUUID();
        open.accounts.push({
          id,
          name: `Wallet ${open.accounts.length + 1}`,
          kind: "derived",
          index,
        });
        open.activeId = id;
        const config = await loadConfig();
        await activateOpen(config, password, open);
        return ok(await publicState());
      }
      case "IMPORT_ACCOUNT": {
        const session = await loadSession();
        const { open, password } = requireOpen(session);
        const mnemonic = assertMnemonic(msg.mnemonic);
        const id = crypto.randomUUID();
        open.accounts.push({
          id,
          name: `Imported ${open.accounts.filter((row) => row.kind === "imported").length + 1}`,
          kind: "imported",
          mnemonic,
        });
        open.activeId = id;
        const config = await loadConfig();
        await activateOpen(config, password, open);
        return ok(await publicState());
      }
      case "RENAME_ACCOUNT": {
        const session = await loadSession();
        const { open, password } = requireOpen(session);
        const account = open.accounts.find((row) => row.id === msg.id);
        if (!account) throw new Error("Unknown wallet.");
        const name = msg.name.trim().slice(0, 24);
        if (!name) throw new Error("Give the wallet a name.");
        account.name = name;
        const config = await loadConfig();
        await persistOpen(config, password, open);
        await saveSession({ ...session, open });
        return ok(await publicState());
      }
      case "REMOVE_ACCOUNT": {
        const session = await loadSession();
        const { open, password } = requireOpen(session);
        if (open.accounts.length < 2) throw new Error("Keep at least one wallet.");
        open.accounts = open.accounts.filter((row) => row.id !== msg.id);
        if (open.activeId === msg.id) open.activeId = open.accounts[0]!.id;
        const config = await loadConfig();
        await activateOpen(config, password, open);
        return ok(await publicState());
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
      const encoded = String(msg.params?.transaction ?? "");
      if (!encoded) throw new Error("Missing transaction.");
      const keypair = requireKeypair(session);
      const simulation = await simulateEncoded(config.rpcUrl, encoded);
      await requestApproval({
        origin,
        kind: "signTransaction",
        preview: summarizeTransaction(encoded),
        simulation,
      });
      return signEncodedTransaction(keypair, encoded);
    }
    case "signAllTransactions": {
      if (!trusted(config, origin)) throw new Error("Site is not connected.");
      const encoded = (msg.params?.transactions ?? []) as string[];
      if (!encoded.length) throw new Error("Missing transactions.");
      const keypair = requireKeypair(session);
      await requestApproval({
        origin,
        kind: "signAllTransactions",
        txCount: encoded.length,
        preview: `Sign ${encoded.length} transaction${encoded.length === 1 ? "" : "s"}.`,
      });
      const signed: string[] = [];
      for (const row of encoded) signed.push(await signEncodedTransaction(keypair, row));
      return signed;
    }
    case "signAndSendTransaction": {
      if (!trusted(config, origin)) throw new Error("Site is not connected.");
      const encoded = String(msg.params?.transaction ?? "");
      if (!encoded) throw new Error("Missing transaction.");
      const keypair = requireKeypair(session);
      const simulation = await simulateEncoded(config.rpcUrl, encoded);
      await requestApproval({
        origin,
        kind: "signAndSendTransaction",
        preview: summarizeTransaction(encoded),
        simulation,
      });
      return signAndSendEncoded(config.rpcUrl, keypair, encoded);
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

try {
  chrome.idle.setDetectionInterval(60);
  chrome.idle.onStateChanged.addListener((state) => {
    if (state === "locked") void lockWallet();
  });
} catch {
  // idle API is optional; a throw here used to block the message listener
}

(globalThis as typeof globalThis & { __earthHandle?: typeof handlePopup }).__earthHandle = handlePopup;

chrome.runtime.onMessage.addListener((message: PopupRequest, sender, sendResponse) => {
  if (sender.id && sender.id !== chrome.runtime.id) return false;
  if (!message || typeof message !== "object" || !("type" in message)) return false;
  void handlePopup(message)
    .then(sendResponse)
    .catch((error: unknown) => sendResponse(fail(error)));
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
