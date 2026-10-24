<!--
  Split a deposit across pots (R2). The sender types every piece except the
  one pot that "takes the rest"; that pot shows whatever is left, so the
  pieces add up to the deposit exactly. The cloth bar shows the real on-chain
  credits, computed the same way the contract does.
-->
<script lang="ts">
  import { formatUsd, parseUsdInput } from "#/money/format"
  import { planSplit, type SplitPlan } from "#/money/split"

  import AdireSwatch from "./AdireSwatch.svelte"

  let {
    names,
    total = $bindable("10.00"),
    pieces = $bindable<string[]>([]),
    restIndex = $bindable(0),
    result = $bindable<{ total: bigint; plan: SplitPlan } | null>(null),
    balance = null,
  }: {
    names: string[]
    total?: string
    pieces?: string[]
    restIndex?: number
    result?: { total: bigint; plan: SplitPlan } | null
    balance?: bigint | null
  } = $props()

  const uid = $props.id()

  const parsedTotal = $derived(parseUsdInput(total))
  const parsedPieces = $derived(
    names.map((_, i) =>
      i === restIndex ? null : parseUsdInput(pieces[i] ?? ""),
    ),
  )
  const pieceError = $derived(
    parsedPieces.findIndex((p) => p !== null && !p.ok),
  )
  const plan = $derived.by((): SplitPlan | null => {
    if (!parsedTotal.ok || pieceError !== -1) return null
    const values = parsedPieces.map((p) => (p && p.ok ? p.value : 0n))
    return planSplit(parsedTotal.value, values, restIndex)
  })

  $effect(() => {
    result = plan && parsedTotal.ok ? { total: parsedTotal.value, plan } : null
  })

  const overBalance = $derived(
    balance !== null && parsedTotal.ok && parsedTotal.value > balance,
  )

  // Width of each cloth piece, from basis points (no floats).
  function share(bps: bigint): string {
    return `${bps / 100n}.${(bps % 100n).toString().padStart(2, "0")}%`
  }
</script>

<div class="editor">
  <div class="total">
    <label for="{uid}-total" class="eyebrow">Amount to add</label>
    <div class="money-input">
      <span aria-hidden="true">$</span>
      <input
        id="{uid}-total"
        inputmode="decimal"
        autocomplete="off"
        bind:value={total}
        aria-invalid={!parsedTotal.ok}
        aria-describedby="{uid}-total-msg"
      />
    </div>
    <p
      id="{uid}-total-msg"
      class="msg"
      class:err={!parsedTotal.ok || overBalance}
    >
      {#if !parsedTotal.ok}
        {parsedTotal.error}
      {:else if overBalance && balance !== null}
        Your wallet has {formatUsd(balance)} MUSD. Lower the amount or get more test
        MUSD.
      {:else}
        MUSD from your wallet, split as below
      {/if}
    </p>
  </div>

  {#if plan && plan.ok}
    <div class="bar" aria-hidden="true">
      {#each names as name, i (i)}
        <div class="seg" style:flex-basis={share(plan.bps[i] ?? 0n)}>
          <AdireSwatch seed={name || `pot-${i}`} />
        </div>
      {/each}
    </div>
  {:else}
    <div class="bar empty" aria-hidden="true"></div>
  {/if}

  <fieldset class="rows">
    <legend class="visually-hidden">Split between pots</legend>
    {#each names as name, i (i)}
      {@const isRest = i === restIndex}
      {@const p = parsedPieces[i]}
      <div class="row" class:rest={isRest}>
        <div class="who">
          <span class="dot"><AdireSwatch seed={name || `pot-${i}`} /></span>
          <span class="name">{name || `Pot ${i + 1}`}</span>
        </div>
        {#if isRest}
          <div class="rest-value num" aria-live="polite">
            {plan ? formatUsd(plan.rest < 0n ? 0n : plan.rest) : "—"}
          </div>
        {:else}
          <div class="money-input small" class:invalid={p && !p.ok}>
            <span aria-hidden="true">$</span>
            <input
              inputmode="decimal"
              autocomplete="off"
              aria-label="Amount for {name || `pot ${i + 1}`}"
              bind:value={pieces[i]}
            />
          </div>
        {/if}
        <label class="take">
          <input
            type="radio"
            name="{uid}-rest"
            value={i}
            bind:group={restIndex}
          />
          <span>{isRest ? "Takes the rest" : "Take the rest"}</span>
        </label>
      </div>
    {/each}
  </fieldset>

  <div
    class="sum"
    class:ok={plan?.ok}
    class:bad={plan && !plan.ok}
    aria-live="polite"
  >
    {#if plan && plan.ok}
      <span class="check" aria-hidden="true">
        <svg viewBox="0 0 20 20"><path d="M5 10.5l3 3 7-7" /></svg>
      </span>
      <span class="num">
        {plan.credits.map((c) => formatUsd(c)).join(" + ")} = {parsedTotal.ok
          ? formatUsd(parsedTotal.value)
          : ""}
      </span>
    {:else if plan}
      <span
        >{plan.error}{plan.rest < 0n
          ? ` Over by ${formatUsd(-plan.rest)}.`
          : ""}</span
      >
    {:else if pieceError !== -1}
      {@const bad = parsedPieces[pieceError]}
      <span
        >{names[pieceError] || "A pot"}: {bad && !bad.ok ? bad.error : ""}</span
      >
    {:else}
      <span>Enter the amount to add.</span>
    {/if}
  </div>

  {#if plan && plan.ok && !plan.exact}
    <p class="note">
      Shares are kept to 0.01%, so the pots get exactly {plan.credits
        .map((c, i) => `${names[i]} ${formatUsd(c)}`)
        .join(", ")}. It still adds up to the full amount.
    </p>
  {/if}
</div>

<style>
  .editor {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .total {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .money-input {
    display: flex;
    align-items: baseline;
    gap: 0.15em;
    border-radius: var(--radius-md);
    font-family: var(--font-display);
    font-size: var(--text-amount);
    line-height: 1.1;
  }
  .money-input span {
    font-size: 0.5em;
    color: var(--ink-2);
  }
  .money-input input {
    width: 100%;
    min-width: 0;
    border: 0;
    background: transparent;
    font-family: inherit;
    font-size: inherit;
    letter-spacing: -0.02em;
    padding: 0;
    border-bottom: 2px solid var(--line-strong);
  }
  .money-input input:focus-visible {
    outline: none;
    border-bottom-color: var(--palm);
  }
  .money-input.small {
    font-size: var(--text-lg);
    font-family: var(--font-ui);
    font-weight: 600;
    align-items: center;
    padding: 0 var(--space-3);
    min-height: 3rem;
    background: var(--surface);
    box-shadow: inset 0 0 0 1px var(--line-strong);
  }
  .money-input.small:focus-within {
    box-shadow: inset 0 0 0 2px var(--indigo);
  }
  .money-input.small.invalid {
    box-shadow: inset 0 0 0 2px var(--osun);
  }
  .money-input.small input {
    border: 0;
    font-variant-numeric: tabular-nums;
    min-height: 2.75rem;
  }
  .msg {
    font-size: var(--text-sm);
    color: var(--ink-3);
  }
  .msg.err {
    color: var(--osun);
  }
  .bar {
    display: flex;
    gap: 0.25rem;
    height: 2.75rem;
  }
  .bar.empty {
    border-radius: var(--radius-sm);
    background: repeating-linear-gradient(
      -45deg,
      var(--surface-2) 0 6px,
      transparent 6px 12px
    );
  }
  .seg {
    flex-grow: 0;
    flex-shrink: 1;
    min-width: 0.5rem;
    border-radius: 0.3rem;
    overflow: hidden;
    transition-property: flex-basis;
    transition-duration: 250ms;
    transition-timing-function: var(--ease);
  }
  .seg:first-child {
    border-radius: var(--radius-sm) 0.3rem 0.3rem var(--radius-sm);
  }
  .seg:last-child {
    border-radius: 0.3rem var(--radius-sm) var(--radius-sm) 0.3rem;
  }
  .rows {
    border: 0;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .row {
    display: grid;
    grid-template-columns: 1fr 9rem;
    grid-template-areas: "who amt" "take take";
    align-items: center;
    gap: var(--space-1) var(--space-3);
    padding: var(--space-3);
    border-radius: var(--radius-md);
    background: var(--surface);
    box-shadow: var(--shadow-1);
  }
  .row.rest {
    box-shadow: inset 0 0 0 2px var(--palm);
  }
  .who {
    grid-area: who;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
  }
  .dot {
    flex: none;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 0.375rem;
    overflow: hidden;
  }
  .name {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .row > .money-input,
  .rest-value {
    grid-area: amt;
  }
  .rest-value {
    text-align: right;
    font-size: var(--text-lg);
    font-weight: 600;
    padding-right: var(--space-3);
  }
  .take {
    grid-area: take;
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-height: var(--tap);
    font-size: var(--text-sm);
    color: var(--ink-2);
    cursor: pointer;
    width: fit-content;
  }
  .take input {
    width: 1.25rem;
    height: 1.25rem;
    accent-color: var(--palm);
    margin: 0;
  }
  .rest .take {
    color: var(--palm-ink);
    font-weight: 600;
  }
  .sum {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    background: var(--surface-2);
    font-size: var(--text-sm);
    font-weight: 600;
  }
  .sum.ok {
    background: var(--leaf-soft);
    color: var(--leaf);
  }
  .sum.bad {
    background: var(--osun-soft);
    color: var(--osun);
  }
  .check {
    display: grid;
    place-items: center;
    flex: none;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 50%;
    background: var(--leaf);
    color: var(--surface);
  }
  .check svg {
    width: 1rem;
    height: 1rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.4;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .note {
    font-size: var(--text-xs);
    color: var(--ink-2);
  }
</style>
