<!-- How much of this period's cap is used (R7). Widths use bigint basis points. -->
<script lang="ts">
  import { formatUsd } from "#/money/format"

  let { spent, cap }: { spent: bigint; cap: bigint } = $props()

  const permyriad = $derived(
    cap === 0n ? 0n : spent >= cap ? 10_000n : (spent * 10_000n) / cap,
  )
  const width = $derived(
    `${permyriad / 100n}.${(permyriad % 100n).toString().padStart(2, "0")}%`,
  )
</script>

<div class="cap">
  <div
    class="track"
    role="meter"
    aria-label="Spending limit used this month"
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={parseInt((permyriad / 100n).toString(), 10)}
    aria-valuetext="{formatUsd(spent)} of {formatUsd(cap)} used"
  >
    <span class="fill" class:full={permyriad >= 10_000n} style:width></span>
  </div>
  <p class="label num">
    {#if cap === 0n}
      No spending limit set yet
    {:else}
      {formatUsd(spent)} of {formatUsd(cap)} used this month
    {/if}
  </p>
</div>

<style>
  .track {
    height: 0.4rem;
    border-radius: var(--radius-pill);
    background: var(--surface-2);
    overflow: hidden;
  }
  .fill {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--palm);
    transition-property: width;
    transition-duration: 300ms;
    transition-timing-function: var(--ease);
  }
  .full {
    background: var(--osun);
  }
  .label {
    margin-top: var(--space-2);
    font-size: var(--text-xs);
    color: var(--ink-2);
  }
</style>
