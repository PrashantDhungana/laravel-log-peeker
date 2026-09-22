/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PEEKER_TOKEN?: string
  readonly VITE_API_ORIGIN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
