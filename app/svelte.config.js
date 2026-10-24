import adapter from "@sveltejs/adapter-static"
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte"

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // Static SPA: the relayer is the only server. Unknown paths (invite
    // links such as /i/abc123) fall back to the client router.
    adapter: adapter({ fallback: "200.html" }),
    alias: { "#": "src/lib" },
  },
}

export default config
