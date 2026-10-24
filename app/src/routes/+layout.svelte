<script lang="ts">
  import "@fontsource/young-serif/400.css"
  import "@fontsource-variable/onest/index.css"
  import "@fontsource/jetbrains-mono/400.css"
  import "../app.css"

  import type { Snippet } from "svelte"

  import { wallet } from "#/chain/wallet.svelte"
  import Header from "#/ui/Header.svelte"
  import { page } from "$app/state"

  let { children }: { children: Snippet } = $props()

  const role = $derived(
    page.url.pathname.startsWith("/send")
      ? ("sender" as const)
      : page.url.pathname.startsWith("/ask") ||
          page.url.pathname.startsWith("/i/")
        ? ("requester" as const)
        : null,
  )

  $effect(() => {
    if (role === "sender") void wallet.init()
  })
</script>

<svelte:head>
  <title>Ìpín · Money with a purpose</title>
</svelte:head>

<a class="skip" href="#main">Skip to content</a>
<Header {role} />
<main id="main">
  {@render children()}
</main>

<style>
  main {
    max-width: var(--content-wide);
    margin: 0 auto;
    padding: var(--space-4) var(--gutter)
      calc(var(--space-7) + env(safe-area-inset-bottom));
  }
  .skip {
    position: absolute;
    left: var(--space-2);
    top: -3rem;
    z-index: 20;
    padding: var(--space-2) var(--space-3);
    background: var(--surface);
    border-radius: var(--radius-sm);
  }
  .skip:focus {
    top: var(--space-2);
  }
</style>
