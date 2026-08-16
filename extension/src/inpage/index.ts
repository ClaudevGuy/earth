import { CHANNEL, WALLET_NAME, WALLET_VERSION } from "../shared/constants";

const ICON =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="28" fill="#0e0b09"/><defs><radialGradient id="g" cx="34%" cy="30%" r="72%"><stop offset="0%" stop-color="#9bb892"/><stop offset="45%" stop-color="#4a828a"/><stop offset="100%" stop-color="#1c3a3e"/></radialGradient></defs><circle cx="64" cy="64" r="38" fill="url(#g)"/><circle cx="64" cy="64" r="40" fill="none" stroke="#e09245" stroke-width="4"/></svg>`,
  );

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function decode58(value: string): Uint8Array {
  const bytes = [0];
  for (const ch of value) {
    const index = ALPHABET.indexOf(ch);
    if (index < 0) throw new Error("Invalid public key");
    let carry = index;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j]! * 58;
      bytes[j] = carry & 255;
      carry >>= 8;
    }
    while (carry) {
      bytes.push(carry & 255);
      carry >>= 8;
    }
  }
  let zeros = 0;
  while (zeros < value.length && value[zeros] === "1") zeros++;
  return Uint8Array.from([...new Array(zeros).fill(0), ...bytes.reverse()]);
}

function b64encode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function b64decode(value: string): Uint8Array {
  const bin = atob(value);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

class EarthPublicKey {
  constructor(readonly _bn: string) {}
  toBase58(): string {
    return this._bn;
  }
  toString(): string {
    return this._bn;
  }
  toJSON(): string {
    return this._bn;
  }
  toBytes(): Uint8Array {
    return decode58(this._bn);
  }
  equals(other: { toBase58?: () => string } | string): boolean {
    return this._bn === (typeof other === "string" ? other : other.toBase58?.() ?? "");
  }
}

type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

const pending = new Map<string, Pending>();
const listeners = new Map<string, Set<(...args: unknown[]) => void>>();

function emit(event: string, ...args: unknown[]) {
  for (const fn of listeners.get(event) ?? []) fn(...args);
}

function request(method: string, params?: Record<string, string | string[] | boolean | undefined>): Promise<unknown> {
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    window.postMessage({ channel: CHANNEL, from: "inpage", id, method, params }, "*");
    window.setTimeout(() => {
      if (pending.delete(id)) reject(new Error("Earth Wallet timed out. Open the extension and retry."));
    }, 5 * 60 * 1000);
  });
}

window.addEventListener("message", (event: MessageEvent) => {
  if (event.source !== window) return;
  const data = event.data as { channel?: string; from?: string; id?: string; ok?: boolean; result?: unknown; error?: string };
  if (data?.channel !== CHANNEL || data.from !== "content" || !data.id) return;
  const waiter = pending.get(data.id);
  if (!waiter) return;
  pending.delete(data.id);
  if (data.ok) waiter.resolve(data.result);
  else waiter.reject(new Error(data.error ?? "Request rejected"));
});

function serializeTx(tx: { serialize?: Function; serializeMessage?: Function; message?: unknown }): string {
  if (tx && typeof tx.serialize === "function") {
    try {
      const bytes = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
      return b64encode(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    } catch {
      const bytes = tx.serialize();
      return b64encode(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    }
  }
  throw new Error("Unsupported transaction type");
}

function restoreTx(original: { constructor: { from?: Function; deserialize?: Function }; message?: unknown }, signedB64: string) {
  const bytes = b64decode(signedB64);
  if (original?.message && typeof original.constructor?.deserialize === "function") {
    return original.constructor.deserialize(bytes);
  }
  if (typeof original.constructor?.from === "function") {
    return original.constructor.from(bytes);
  }
  return bytes;
}

let publicKey: EarthPublicKey | null = null;
let connected = false;

async function connect(opts?: { onlyIfTrusted?: boolean }) {
  const address = (await request("connect", { onlyIfTrusted: Boolean(opts?.onlyIfTrusted) })) as string | null;
  if (!address) {
    connected = false;
    publicKey = null;
    return { publicKey: null };
  }
  publicKey = new EarthPublicKey(address);
  connected = true;
  emit("connect", publicKey);
  syncStandardAccounts(address);
  return { publicKey };
}

async function disconnect() {
  await request("disconnect");
  publicKey = null;
  connected = false;
  emit("disconnect");
  syncStandardAccounts(null);
}

const provider = {
  isEarth: true,
  isPhantom: false,
  isSolflare: false,
  version: WALLET_VERSION,
  get publicKey() {
    return publicKey;
  },
  get isConnected() {
    return connected;
  },
  connect,
  disconnect,
  on(event: string, fn: (...args: unknown[]) => void) {
    const set = listeners.get(event) ?? new Set();
    set.add(fn);
    listeners.set(event, set);
  },
  off(event: string, fn: (...args: unknown[]) => void) {
    listeners.get(event)?.delete(fn);
  },
  async signTransaction(tx: { serialize?: Function; message?: unknown; constructor: { from?: Function; deserialize?: Function } }) {
    const signed = (await request("signTransaction", { transaction: serializeTx(tx) })) as string;
    return restoreTx(tx, signed);
  },
  async signAllTransactions(txs: Array<{ serialize?: Function; message?: unknown; constructor: { from?: Function; deserialize?: Function } }>) {
    const signed = (await request("signAllTransactions", { transactions: txs.map(serializeTx) })) as string[];
    return txs.map((tx, i) => restoreTx(tx, signed[i]!));
  },
  async signAndSendTransaction(tx: { serialize?: Function; message?: unknown; constructor: { from?: Function; deserialize?: Function } }) {
    return request("signAndSendTransaction", { transaction: serializeTx(tx) });
  },
  async signMessage(message: Uint8Array | string) {
    const bytes = typeof message === "string" ? new TextEncoder().encode(message) : message;
    const result = (await request("signMessage", { message: b64encode(bytes) })) as { signature: string; publicKey: string };
    return { signature: b64decode(result.signature), publicKey: new EarthPublicKey(result.publicKey) };
  },
  async request(input: { method: string; params?: Record<string, unknown> }) {
    if (input.method === "connect") return connect(input.params as { onlyIfTrusted?: boolean });
    if (input.method === "disconnect") return disconnect();
    throw new Error(`Earth Wallet does not support ${input.method}`);
  },
};

type StandardAccount = {
  address: string;
  publicKey: Uint8Array;
  chains: string[];
  features: string[];
  label: string;
};

const standardAccounts: StandardAccount[] = [];
const standardListeners = new Set<() => void>();

function syncStandardAccounts(address: string | null) {
  standardAccounts.splice(0, standardAccounts.length);
  if (address) {
    standardAccounts.push({
      address,
      publicKey: decode58(address),
      chains: ["solana:mainnet", "solana:devnet"],
      features: [
        "solana:signTransaction",
        "solana:signAndSendTransaction",
        "solana:signAllTransactions",
        "solana:signMessage",
      ],
      label: WALLET_NAME,
    });
  }
  for (const fn of standardListeners) fn();
}

const walletStandard = {
  version: "1.0.0",
  name: WALLET_NAME,
  icon: ICON as `data:image/svg+xml;base64,${string}`,
  chains: ["solana:mainnet", "solana:devnet"],
  accounts: standardAccounts,
  features: {
    "standard:connect": {
      version: "1.0.0",
      connect: async () => {
        await connect();
        return { accounts: standardAccounts };
      },
    },
    "standard:disconnect": {
      version: "1.0.0",
      disconnect,
    },
    "standard:events": {
      version: "1.0.0",
      on: (event: string, fn: () => void) => {
        if (event === "change") standardListeners.add(fn);
        return () => standardListeners.delete(fn);
      },
    },
    "solana:signTransaction": {
      version: "1.0.0",
      signTransaction: async ({ transaction }: { transaction: Uint8Array }) => {
        const signed = (await request("signTransaction", { transaction: b64encode(transaction) })) as string;
        return [{ signedTransaction: b64decode(signed) }];
      },
    },
    "solana:signAllTransactions": {
      version: "1.0.0",
      signAllTransactions: async ({ transactions }: { transactions: Uint8Array[] }) => {
        const signed = (await request("signAllTransactions", {
          transactions: transactions.map(b64encode),
        })) as string[];
        return signed.map((item) => ({ signedTransaction: b64decode(item) }));
      },
    },
    "solana:signMessage": {
      version: "1.0.0",
      signMessage: async ({ message }: { message: Uint8Array }) => {
        const result = (await request("signMessage", { message: b64encode(message) })) as { signature: string };
        return [{ signature: b64decode(result.signature), signedMessage: message }];
      },
    },
    "solana:signAndSendTransaction": {
      version: "1.0.0",
      signAndSendTransaction: async ({ transaction }: { transaction: Uint8Array }) => {
        const result = (await request("signAndSendTransaction", { transaction: b64encode(transaction) })) as {
          signature: string;
        };
        return [{ signature: result.signature }];
      },
    },
  },
};

function register(registerWallet: (wallet: typeof walletStandard) => void) {
  registerWallet(walletStandard);
}

window.addEventListener("wallet-standard:app-ready", ((event: CustomEvent<(wallet: typeof walletStandard) => void>) => {
  register(event.detail);
}) as EventListener);
window.dispatchEvent(
  new CustomEvent("wallet-standard:register-wallet", {
    detail: register,
  }),
);

const w = window as Window & {
  solana?: typeof provider;
  earth?: { solana: typeof provider };
  earthWallet?: typeof provider;
};

w.earth = { solana: provider };
w.earthWallet = provider;
if (!w.solana) w.solana = provider;

window.dispatchEvent(new Event("earth#initialized"));
