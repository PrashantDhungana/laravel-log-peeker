/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PEEKER_TOKEN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
