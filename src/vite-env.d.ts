/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RPC_URL?: string;
  readonly VITE_EARTH_MINT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  Buffer: typeof import("buffer").Buffer;
}
