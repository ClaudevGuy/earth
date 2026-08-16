export type EarthProvider = {
  isEarth?: boolean;
  publicKey?: { toBase58(): string } | null;
  isConnected?: boolean;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toBase58(): string } | null }>;
  disconnect?: () => Promise<void>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  off?: (event: string, handler: (...args: unknown[]) => void) => void;
};

type EarthWindow = Window & {
  solana?: EarthProvider;
  earth?: { solana?: EarthProvider };
  earthWallet?: EarthProvider;
};

function asEarth(provider: EarthProvider | undefined): EarthProvider | undefined {
  if (!provider) return undefined;
  if (provider.isEarth === false) return undefined;
  return provider;
}

export function getEarthProvider(): EarthProvider | undefined {
  const w = window as EarthWindow;
  return asEarth(w.earth?.solana) ?? asEarth(w.earthWallet) ?? (w.solana?.isEarth ? w.solana : undefined);
}

export function isEarthWalletInstalled(): boolean {
  return Boolean(getEarthProvider());
}

function addressOf(provider: EarthProvider, fromConnect?: { publicKey: { toBase58(): string } | null }): string | undefined {
  return fromConnect?.publicKey?.toBase58() ?? provider.publicKey?.toBase58() ?? undefined;
}

export async function connectEarthWallet(opts?: { onlyIfTrusted?: boolean }): Promise<string | undefined> {
  const provider = getEarthProvider();
  if (!provider) {
    throw new Error("Earth Wallet is not installed. Load the Chrome extension and refresh this page.");
  }
  const res = await provider.connect(opts);
  const key = addressOf(provider, res);
  if (!key) {
    if (opts?.onlyIfTrusted) return undefined;
    throw new Error("Earth Wallet did not return a public key. Unlock the extension and retry.");
  }
  return key;
}

export async function disconnectEarthWallet(): Promise<void> {
  await getEarthProvider()?.disconnect?.();
}

export function subscribeEarthWallet(handler: (address: string | undefined) => void): () => void {
  const provider = getEarthProvider();
  if (!provider?.on) return () => {};

  const onConnect = (...args: unknown[]) => {
    const key = args[0] as { toBase58?: () => string } | undefined;
    handler(key?.toBase58?.() ?? addressOf(provider));
  };
  const onDisconnect = () => handler(undefined);
  const onAccount = (...args: unknown[]) => {
    const next = args[0] as { toBase58?: () => string } | string | null | undefined;
    if (!next) {
      handler(undefined);
      return;
    }
    handler(typeof next === "string" ? next : next.toBase58?.());
  };

  provider.on("connect", onConnect);
  provider.on("disconnect", onDisconnect);
  provider.on("accountChanged", onAccount);
  return () => {
    provider.off?.("connect", onConnect);
    provider.off?.("disconnect", onDisconnect);
    provider.off?.("accountChanged", onAccount);
  };
}
