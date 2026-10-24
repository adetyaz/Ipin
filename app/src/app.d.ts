// See https://svelte.dev/docs/kit/types#app.d.ts
import type { EIP1193Provider } from "viem"

declare global {
  interface Window {
    ethereum?: EIP1193Provider
  }
  namespace App {}
}

export {}
