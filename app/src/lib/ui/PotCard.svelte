<script lang="ts">
  import type { PotView } from "#/chain/vault"

  import AdireSwatch from "./AdireSwatch.svelte"
  import Amount from "./Amount.svelte"
  import CapMeter from "./CapMeter.svelte"

  let { pot }: { pot: PotView } = $props()
</script>

<a class="pot" href="/send/pot/{pot.id}">
  <div class="cloth"><AdireSwatch seed={pot.name} /></div>
  <div class="body">
    <div class="head">
      <h3>{pot.name}</h3>
      <span class="chev" aria-hidden="true">
        <svg viewBox="0 0 20 20"><path d="M8 5l5 5-5 5" /></svg>
      </span>
    </div>
    <div class="bal">
      <Amount value={pot.balance} size="lg" naira />
    </div>
    <CapMeter spent={pot.spent} cap={pot.cap} />
  </div>
</a>

<style>
  .pot {
    display: grid;
    grid-template-rows: 3rem auto;
    background: var(--surface);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-1);
    overflow: hidden;
    color: inherit;
    text-decoration: none;
    transition-property: box-shadow, scale;
    transition-duration: 150ms;
    transition-timing-function: var(--ease);
  }
  .pot:active {
    scale: 0.985;
  }
  @media (hover: hover) {
    .pot:hover {
      box-shadow: var(--shadow-2);
    }
  }
  .pot:focus-visible {
    border-radius: var(--radius-lg);
  }
  .cloth {
    height: 100%;
  }
  .body {
    padding: var(--space-4) var(--space-5) var(--space-5);
    min-width: 0;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-2);
  }
  h3 {
    font-size: var(--text-lg);
  }
  .chev {
    color: var(--ink-3);
  }
  svg {
    width: 1.25rem;
    height: 1.25rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
    display: block;
  }
  .bal {
    margin: var(--space-3) 0 var(--space-4);
  }
</style>
