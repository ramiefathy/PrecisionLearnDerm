/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BLUEPRINTS_V1?: string;
  readonly VITE_REVIEW_QUEUE_V1?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

