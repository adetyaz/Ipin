<!--
  Everything the sender sees sits behind this: Ìpín deployed, MetaMask present,
  connected, on Mezo testnet. Each missing piece gets one clear next step.
-->
<script lang="ts">
  import type { Snippet } from "svelte"

  import { MEZO_FAUCET } from "#/chain/client"
  import { deployment } from "#/chain/deployment"
  import { wallet } from "#/chain/wallet.svelte"

  import Button from "./Button.svelte"
  import Notice from "./Notice.svelte"

  let { children }: { children: Snippet } = $props()

  let switching = $state(false)

  async function switchChain() {
    switching = true
    await wallet.switchToMezo()
    switching = false
  }
</script>

{#if deployment.status === "missing"}
  <div class="gate card">
    <p class="eyebrow">Mezo testnet</p>
    <h2>Not deployed yet</h2>
    <p class="muted">
      The Ìpín vault isn't on Mezo testnet yet. Once it's deployed, your pots
      and requests show up here.
    </p>
  </div>
{:else if deployment.status === "invalid"}
  <div class="gate card">
    <h2>Deployment file needs fixing</h2>
    <p class="muted">{deployment.message}</p>
  </div>
{:else if wallet.status === "unavailable"}
  <div class="gate card">
    <p class="eyebrow">Step 1 of 2</p>
    <h2>Get MetaMask to send money</h2>
    <p class="muted">
      As the sender you approve every payment with your wallet. Install
      MetaMask, then come back to this page.
    </p>
    <Button href="https://metamask.io/download/" size="lg" full
      >Install MetaMask</Button
    >
    <p class="small muted">
      Were you invited to ask for money? Open the link the sender shared with
      you. You don't need a wallet.
    </p>
  </div>
{:else if wallet.status !== "connected"}
  <div class="gate card">
    <p class="eyebrow">Step 1 of 2</p>
    <h2>Connect your wallet</h2>
    <p class="muted">
      Ìpín never holds your keys. Your wallet signs each approval, and only you
      can change a pot's rules.
    </p>
    <Button
      size="lg"
      full
      busy={wallet.status === "connecting"}
      onclick={() => wallet.connect()}
    >
      {wallet.status === "connecting" ? "Check MetaMask…" : "Connect MetaMask"}
    </Button>
    {#if wallet.error}<Notice tone="error">{wallet.error}</Notice>{/if}
  </div>
{:else if !wallet.onMezo}
  <div class="gate card">
    <p class="eyebrow">Step 2 of 2</p>
    <h2>Switch to Mezo testnet</h2>
    <p class="muted">
      Pots hold MUSD on Mezo testnet. We'll add the network to MetaMask if it
      isn't there yet.
    </p>
    <Button size="lg" full busy={switching} onclick={switchChain}>
      {switching ? "Check MetaMask…" : "Add / switch to Mezo testnet"}
    </Button>
    {#if wallet.error}<Notice tone="error">{wallet.error}</Notice>{/if}
    <p class="small muted">
      Need test BTC for gas? <a
        href={MEZO_FAUCET}
        target="_blank"
        rel="noreferrer">Mezo faucet</a
      >
    </p>
  </div>
{:else}
  {@render children()}
{/if}

<style>
  .gate {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    max-width: var(--content);
    margin: var(--space-6) auto 0;
  }
  h2 {
    font-size: var(--text-xl);
  }
  .small {
    font-size: var(--text-sm);
  }
</style>
