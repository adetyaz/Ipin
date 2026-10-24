<script lang="ts">
  import {
    potNameError,
    readMusdBalance,
    setupInOneTransaction,
  } from "#/chain/vault"
  import { wallet } from "#/chain/wallet.svelte"
  import { formatUsd, parseUsdInput } from "#/money/format"
  import type { SplitPlan } from "#/money/split"
  import AdireSwatch from "#/ui/AdireSwatch.svelte"
  import Button from "#/ui/Button.svelte"
  import { Flow } from "#/ui/flow.svelte"
  import Notice from "#/ui/Notice.svelte"
  import SplitEditor from "#/ui/SplitEditor.svelte"
  import Steps from "#/ui/Steps.svelte"
  import WalletGate from "#/ui/WalletGate.svelte"

  const MAX_POTS = 10 // Pots.MAX_SPLIT_POTS

  // The house story at testnet scale (1:100): $10 -> House $7.50, Upkeep $2.50.
  let pots = $state([
    { name: "House", cap: "7.50" },
    { name: "Upkeep", cap: "2.50" },
  ])
  let total = $state("10.00")
  let pieces = $state<string[]>(["7.50", ""])
  let restIndex = $state(1)
  let split = $state<{ total: bigint; plan: SplitPlan } | null>(null)
  let addMoney = $state(true)
  let balance = $state<bigint | null>(null)

  const flow = new Flow()

  $effect(() => {
    if (wallet.ready && wallet.account) {
      readMusdBalance(wallet.account)
        .then((b) => (balance = b))
        .catch(() => (balance = null))
    }
  })

  const names = $derived(pots.map((p) => p.name.trim()))
  const nameErrors = $derived(pots.map((p) => potNameError(p.name)))
  const caps = $derived(pots.map((p) => parseUsdInput(p.cap)))
  const dupName = $derived(
    names.findIndex((n, i) => n !== "" && names.indexOf(n) !== i),
  )

  const formError = $derived.by(() => {
    const ni = nameErrors.findIndex((e) => e !== null)
    if (ni !== -1) return `Pot ${ni + 1}: ${nameErrors[ni]}`
    if (dupName !== -1) return `Two pots are called “${names[dupName]}”.`
    const ci = caps.findIndex((c) => !c.ok)
    if (ci !== -1) {
      const c = caps[ci]
      return `${names[ci]} monthly limit: ${c && !c.ok ? c.error : ""}`
    }
    if (addMoney) {
      if (!split || !split.plan.ok) return "Fix the split so it adds up."
      if (balance !== null && split.total > balance) {
        return "Your wallet doesn't have enough MUSD for this amount."
      }
    }
    return null
  })

  function addPot() {
    if (pots.length >= MAX_POTS) return
    pots.push({ name: "", cap: "1.00" })
    pieces.push("")
  }

  function removePot(i: number) {
    if (pots.length <= 1) return
    pots.splice(i, 1)
    pieces.splice(i, 1)
    if (restIndex >= pots.length) restIndex = pots.length - 1
  }

  async function submit() {
    if (formError) return
    const plan = split?.plan
    const deposit =
      addMoney && split && plan && plan.ok
        ? { bps: plan.bps, restIndex, amount: split.total }
        : undefined
    const label =
      pots.length === 1
        ? `Create the ${names[0] ?? ""} pot`
        : `Create ${String(pots.length)} pots`
    await flow.run([
      {
        label: deposit
          ? `${label}, save the split and add ${formatUsd(deposit.amount)}`
          : label,
        hint: deposit
          ? "MetaMask asks twice: sign the amount (free), then confirm one transaction"
          : "Confirm one transaction in MetaMask",
        run: () =>
          setupInOneTransaction({
            pots: pots.map((p, i) => ({
              name: p.name,
              cap: caps[i]?.ok ? caps[i].value : 0n,
            })),
            ...(deposit ? { deposit } : {}),
          }),
      },
    ])
  }
</script>

<svelte:head><title>Create pots · Ìpín</title></svelte:head>

<WalletGate>
  <div class="page">
    <a class="back" href="/send">← Your pots</a>
    <h1>Create pots</h1>
    <p class="muted intro">
      One pot per purpose. Money leaves a pot only to payees you approve, and
      never more than its monthly limit.
    </p>

    {#if flow.done}
      <div class="card done">
        <Notice tone="success" title="Your pots are ready">
          {addMoney && split
            ? `${formatUsd(split.total)} is in your pots, split exactly as you set.`
            : "Add money whenever you're ready."}
        </Notice>
        <Steps {flow} />
        <Button href="/send" size="lg" full>See your pots</Button>
      </div>
    {:else}
      <section class="card" aria-labelledby="pots-h">
        <h2 id="pots-h">Pots</h2>
        <div class="pots">
          {#each pots as pot, i (i)}
            <div class="pot">
              <span class="swatch"
                ><AdireSwatch seed={pot.name || `pot-${i}`} /></span
              >
              <label class="f name">
                <span>Name</span>
                <input
                  bind:value={pot.name}
                  maxlength="32"
                  placeholder="e.g. School fees"
                  aria-invalid={nameErrors[i] !== null && pot.name !== ""}
                />
              </label>
              <label class="f cap">
                <span>Monthly limit</span>
                <span class="money">
                  <span aria-hidden="true">$</span>
                  <input
                    bind:value={pot.cap}
                    inputmode="decimal"
                    aria-invalid={!caps[i]?.ok}
                  />
                </span>
              </label>
              {#if pots.length > 1}
                <button
                  class="remove"
                  type="button"
                  onclick={() => removePot(i)}
                  aria-label="Remove {pot.name || `pot ${i + 1}`}"
                >
                  <svg viewBox="0 0 20 20"><path d="M6 6l8 8M14 6l-8 8" /></svg>
                </button>
              {/if}
            </div>
          {/each}
        </div>
        {#if pots.length < MAX_POTS}
          <Button variant="ghost" onclick={addPot}>+ Add another pot</Button>
        {/if}
        <p class="hint">
          The limit is how much can leave the pot every 30 days, payments and
          allowances together.
        </p>
      </section>

      <section class="card" aria-labelledby="money-h">
        <div class="money-head">
          <h2 id="money-h">Add money now</h2>
          <label class="switch">
            <input type="checkbox" bind:checked={addMoney} />
            <span class="visually-hidden">Add money now</span>
          </label>
        </div>
        {#if addMoney}
          <SplitEditor
            {names}
            bind:total
            bind:pieces
            bind:restIndex
            bind:result={split}
            {balance}
          />
        {:else}
          <p class="muted">You can add money to these pots later.</p>
        {/if}
      </section>

      <div class="submit">
        {#if formError && !flow.running}
          <p class="form-error" role="status">{formError}</p>
        {/if}
        <Steps {flow} />
        {#if flow.error}
          <Notice tone="error" title="That step didn't go through">
            Nothing was created and no money moved: the whole setup is one
            transaction. Fix it and press the button again.
          </Notice>
        {/if}
        <Button
          size="lg"
          full
          busy={flow.running}
          disabled={!!formError}
          onclick={submit}
        >
          {#if flow.running}
            Working… keep this page open
          {:else if addMoney && split?.plan.ok}
            Create {pots.length === 1 ? "pot" : `${pots.length} pots`} and add {formatUsd(
              split.total,
            )}
          {:else}
            Create {pots.length === 1 ? "pot" : `${pots.length} pots`}
          {/if}
        </Button>
        <p class="hint center">
          One transaction for everything. Gas is paid in test BTC.
        </p>
      </div>
    {/if}
  </div>
</WalletGate>

<style>
  .page {
    max-width: 36rem;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .back {
    display: inline-flex;
    align-items: center;
    min-height: var(--tap);
    width: fit-content;
    font-size: var(--text-sm);
    font-weight: 600;
    text-decoration: none;
  }
  h1 {
    font-size: var(--text-2xl);
  }
  .intro {
    margin-bottom: var(--space-2);
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  h2 {
    font-size: var(--text-lg);
  }
  .pots {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .pot {
    display: grid;
    grid-template-columns: 2.5rem 1fr 7.5rem auto;
    gap: var(--space-2);
    align-items: end;
  }
  .swatch {
    width: 2.5rem;
    height: 3rem;
    border-radius: var(--radius-sm);
    overflow: hidden;
  }
  .f {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
  }
  .f > span:first-child {
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--ink-2);
  }
  .f input {
    width: 100%;
    min-height: 3rem;
    padding: 0 var(--space-3);
    border: 0;
    border-radius: var(--radius-md);
    background: var(--surface);
    box-shadow: inset 0 0 0 1px var(--line-strong);
  }
  .f input:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 2px var(--indigo);
  }
  .f input:disabled {
    background: var(--surface-2);
    box-shadow: none;
  }
  .money {
    position: relative;
    display: block;
  }
  .money span {
    position: absolute;
    left: var(--space-3);
    top: 50%;
    translate: 0 -50%;
    color: var(--ink-3);
  }
  .money input {
    padding-left: 1.6rem;
    font-variant-numeric: tabular-nums;
  }
  .remove {
    display: grid;
    place-items: center;
    width: var(--tap);
    height: 3rem;
    border: 0;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--ink-3);
    cursor: pointer;
  }
  @media (hover: hover) {
    .remove:hover {
      background: var(--osun-soft);
      color: var(--osun);
    }
  }
  .remove svg {
    width: 1.1rem;
    height: 1.1rem;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
  }
  @media (max-width: 420px) {
    .pot {
      grid-template-columns: 2rem 1fr 6.5rem auto;
    }
    .swatch {
      width: 2rem;
    }
  }
  .hint {
    font-size: var(--text-xs);
    color: var(--ink-3);
  }
  .center {
    text-align: center;
  }
  .money-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .switch {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: var(--tap);
    min-height: var(--tap);
    cursor: pointer;
  }
  .switch input {
    appearance: none;
    width: 2.75rem;
    height: 1.6rem;
    border-radius: var(--radius-pill);
    background: var(--line-strong);
    position: relative;
    cursor: pointer;
    transition-property: background-color;
    transition-duration: 150ms;
    margin: 0;
  }
  .switch input::after {
    content: "";
    position: absolute;
    top: 0.2rem;
    left: 0.2rem;
    width: 1.2rem;
    height: 1.2rem;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.2);
    transition-property: translate;
    transition-duration: 150ms;
    transition-timing-function: var(--ease);
  }
  .switch input:checked {
    background: var(--indigo);
  }
  .switch input:checked::after {
    translate: 1.15rem 0;
  }
  .submit {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .form-error {
    font-size: var(--text-sm);
    color: var(--osun);
    font-weight: 600;
  }
  .done {
    gap: var(--space-5);
  }
</style>
