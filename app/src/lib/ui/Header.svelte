<script lang="ts">
  import { wallet } from "#/chain/wallet.svelte"
  import { readJson, writeJson } from "#/storage"
  import { page } from "$app/state"

  let { role }: { role: "sender" | "requester" | null } = $props()

  type Theme = "system" | "light" | "dark"
  let theme = $state<Theme>(readJson<Theme>("ipin:theme") ?? "system")

  function cycleTheme() {
    const next: Theme =
      theme === "system" ? "light" : theme === "light" ? "dark" : "system"
    theme = next
    writeJson("ipin:theme", next)
    // Snap the theme instead of letting every transition smear at once.
    const style = document.createElement("style")
    style.textContent = "*,*::before,*::after{transition:none !important}"
    document.head.appendChild(style)
    if (next === "system") delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = next
    void document.body.offsetHeight
    requestAnimationFrame(() => style.remove())
  }

  const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
  const path: string = $derived(page.url.pathname)
</script>

<header class="bar">
  <div class="inner">
    <a class="brand" href="/" aria-label="Ìpín home">
      <span class="mark" aria-hidden="true">
        <svg viewBox="0 0 32 32">
          <rect width="32" height="32" rx="9" class="bg" />
          <path d="M9 22.5V14M16 22.5V9.5M23 22.5V17" class="stroke" />
        </svg>
      </span>
      <span class="word">Ìpín</span>
    </a>

    {#if role === "sender"}
      <nav aria-label="Sender">
        <a href="/send" aria-current={path === "/send" ? "page" : undefined}
          >Pots</a
        >
        <a
          href="/send/requests"
          aria-current={path.startsWith("/send/requests") ? "page" : undefined}
          >Requests</a
        >
      </nav>
    {/if}

    <div class="right">
      {#if role === "sender" && wallet.account}
        <span class="chip" class:warn={!wallet.onMezo} title={wallet.account}>
          <span class="dot" aria-hidden="true"></span>
          <span class="mono">{short(wallet.account)}</span>
          <span class="visually-hidden"
            >{wallet.onMezo ? "on Mezo testnet" : "wrong network"}</span
          >
        </span>
      {/if}
      <button
        class="theme"
        onclick={cycleTheme}
        aria-label="Theme: {theme}. Change theme"
      >
        {#if theme === "dark"}
          <svg viewBox="0 0 20 20"
            ><path d="M15.5 12.5A6 6 0 017.5 4.5a6 6 0 108 8z" /></svg
          >
        {:else if theme === "light"}
          <svg viewBox="0 0 20 20"
            ><circle cx="10" cy="10" r="3.2" /><path
              d="M10 2.5v1.6M10 15.9v1.6M2.5 10h1.6M15.9 10h1.6M4.7 4.7l1.1 1.1M14.2 14.2l1.1 1.1M4.7 15.3l1.1-1.1M14.2 5.8l1.1-1.1"
            /></svg
          >
        {:else}
          <svg viewBox="0 0 20 20"
            ><circle cx="10" cy="10" r="6.5" /><path
              d="M10 3.5v13a6.5 6.5 0 000-13z"
              class="half"
            /></svg
          >
        {/if}
      </button>
    </div>
  </div>
</header>

<style>
  .bar {
    position: sticky;
    top: 0;
    z-index: 10;
    background: color-mix(in srgb, var(--bg) 88%, transparent);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    padding-top: env(safe-area-inset-top);
  }
  .inner {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    max-width: var(--content-wide);
    margin: 0 auto;
    padding: var(--space-2) var(--gutter);
    min-height: 3.5rem;
  }
  .brand {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-height: var(--tap);
    color: var(--ink);
    text-decoration: none;
  }
  .mark svg {
    width: 2rem;
    height: 2rem;
    display: block;
  }
  .mark .bg {
    fill: var(--cloth);
  }
  .mark .stroke {
    stroke: var(--palm);
    stroke-width: 3.2;
    stroke-linecap: round;
    fill: none;
  }
  .word {
    font-family: var(--font-display);
    font-size: var(--text-lg);
    letter-spacing: -0.01em;
  }
  nav {
    display: flex;
    gap: var(--space-1);
  }
  nav a {
    display: inline-flex;
    align-items: center;
    min-height: var(--tap);
    padding: 0 var(--space-3);
    border-radius: var(--radius-pill);
    color: var(--ink-2);
    font-size: var(--text-sm);
    font-weight: 600;
    text-decoration: none;
  }
  nav a[aria-current="page"] {
    color: var(--ink);
    background: var(--surface);
    box-shadow: var(--shadow-1);
  }
  .right {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .chip {
    display: none;
    align-items: center;
    gap: var(--space-2);
    padding: 0.35rem 0.75rem;
    border-radius: var(--radius-pill);
    background: var(--surface);
    box-shadow: var(--shadow-1);
    font-size: var(--text-xs);
  }
  @media (min-width: 640px) {
    .chip {
      display: inline-flex;
    }
  }
  .chip .dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: var(--leaf);
  }
  .chip.warn .dot {
    background: var(--palm);
  }
  .theme {
    display: grid;
    place-items: center;
    width: var(--tap);
    height: var(--tap);
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--ink-2);
    cursor: pointer;
  }
  @media (hover: hover) {
    .theme:hover {
      background: var(--surface-2);
    }
  }
  .theme svg {
    width: 1.25rem;
    height: 1.25rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .theme .half {
    fill: currentColor;
    stroke: none;
  }
  @media (max-width: 380px) {
    nav a {
      padding: 0 var(--space-2);
    }
  }
</style>
