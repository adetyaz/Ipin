import { sveltekit } from "@sveltejs/kit/vite"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [sveltekit()],
  // The deployments file and ABIs live outside app/ (repo root, contracts/).
  server: { fs: { allow: [".."] } },
  test: { include: ["src/**/*.test.ts"], environment: "node" },
})
