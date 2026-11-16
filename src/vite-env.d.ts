/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_NAME?: string
  readonly VITE_API_BASE_URL?: string
  readonly VITE_API_MOCK?: string
  readonly VITE_API_TIMEOUT_MS?: string
  readonly VITE_API_PROXY_TARGET?: string
  readonly VITE_GUEST_MODE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
