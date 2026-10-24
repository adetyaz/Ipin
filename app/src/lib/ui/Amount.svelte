<!-- A MUSD amount shown as dollars. Big sizes set the cents smaller. -->
<script lang="ts">
  import { formatNgn, formatUsd, splitUsd } from "#/money/format"
  import { env } from "$env/dynamic/public"

  let {
    value,
    size = "md",
    naira = false,
  }: {
    value: bigint
    size?: "sm" | "md" | "lg" | "xl"
    naira?: boolean
  } = $props()

  const rate = $derived(
    env.PUBLIC_NGN_PER_USD && /^\d+$/.test(env.PUBLIC_NGN_PER_USD)
      ? BigInt(env.PUBLIC_NGN_PER_USD)
      : null,
  )
  const parts = $derived(splitUsd(value))
</script>

{#if size === "xl" || size === "lg"}
  <span class="amount {size}" aria-label={formatUsd(value)}>
    <span class="cur" aria-hidden="true">$</span><span
      class="dollars"
      aria-hidden="true">{parts.dollars}</span
    ><span class="cents" aria-hidden="true">.{parts.cents}</span>
  </span>
{:else}
  <span class="amount {size} num">{formatUsd(value)}</span>
{/if}
{#if naira && rate !== null}
  <span class="ngn num">≈ {formatNgn(value, rate)}</span>
{/if}

<style>
  .amount {
    white-space: nowrap;
  }
  .lg,
  .xl {
    font-family: var(--font-display);
    line-height: 1;
    letter-spacing: -0.02em;
    font-variant-numeric: lining-nums;
  }
  .xl {
    font-size: var(--text-amount);
  }
  .lg {
    font-size: var(--text-2xl);
  }
  .cur {
    font-size: 0.5em;
    vertical-align: 0.72em;
    margin-right: 0.06em;
    color: var(--ink-2);
  }
  .cents {
    font-size: 0.5em;
    vertical-align: 0.72em;
    margin-left: 0.04em;
    color: var(--ink-2);
  }
  .sm {
    font-size: var(--text-sm);
  }
  .md {
    font-weight: 600;
  }
  .ngn {
    display: block;
    margin-top: var(--space-1);
    font-size: var(--text-xs);
    color: var(--ink-3);
  }
</style>
