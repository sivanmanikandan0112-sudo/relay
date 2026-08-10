/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend API base URL, e.g. "https://relay-backend.up.railway.app/api". Unset locally -- "/api" (proxied by vite.config.ts) is the default. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
