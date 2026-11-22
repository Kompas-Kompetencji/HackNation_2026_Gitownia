/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_MOCKS?: string
  readonly VITE_API_URL?: string
  /** Lista funkcji api.ts działających na prawdziwym API, oddzielona przecinkami ("*" = wszystkie gotowe). */
  readonly VITE_REAL_API?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
