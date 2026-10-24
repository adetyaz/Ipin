/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
// App-shell cache so Ìpín opens on a weak connection. Only same-origin built
// files are cached; RPC and relayer calls (money state) always hit the network.
import { build, files, version } from "$service-worker"

const sw = self as unknown as ServiceWorkerGlobalScope
const CACHE = `ipin-${version}`
const SHELL = [...build, ...files]

sw.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (c) => {
      await c.addAll(SHELL)
      // The SPA fallback page exists only in production builds.
      await c.add("/200.html").catch(() => undefined)
    }),
  )
})

sw.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        ),
      ),
  )
})

sw.addEventListener("fetch", (event) => {
  const req = event.request
  if (req.method !== "GET") return
  const url = new URL(req.url)
  if (url.origin !== sw.location.origin) return

  if (SHELL.includes(url.pathname)) {
    event.respondWith(caches.match(req).then((hit) => hit ?? fetch(req)))
    return
  }
  // Page navigations: network first, fall back to the cached SPA shell.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(
        async () => (await caches.match("/200.html")) ?? Response.error(),
      ),
    )
  }
})
