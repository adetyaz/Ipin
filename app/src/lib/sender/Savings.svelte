<!--
  Savings (R10): idle pot money earns in Mezo's MUSD savings vault (sMUSD).
  It stays this pot's money: it can't be spent while saved, and it comes
  back to this pot. Yield is shared between pots by what each has saved.
-->
<script lang="ts">
  import { explorer } from "#/chain/client"
  import { readSavings, type SavingsView, vaultWrites } from "#/chain/vault"
  import { formatUsd, parseUsdInput } from "#/money/format"
  import Button from "#/ui/Button.svelte"
  import { Flow } from "#/ui/flow.svelte"
  import Notice from "#/ui/Notice.svelte"
  import Steps from "#/ui/Steps.svelte"

  let {
    potId,
    balance,
    refresh,
    onchange,
  }: {
    potId: bigint
    /** The pot's spendable balance. */
    balance: bigint
    refresh: number
    onchange: () => void
  } = $props()

  let view = $state<SavingsView | null>(null)
  let loadError = $state(false)
  let amount = $state("")
  const flow = new Flow()

  $effect(() => {
    void refresh
    readSavings(potId)
      .then((v) => {
        view = v
        loadError = false
      })
      .catch(() => (loadError = true))
  })

  const parsed = $derived(parseUsdInput(amount))
  const value = $derived(parsed.ok ? parsed.value : 0n)
  const canSave = $derived(parsed.ok && value > 0n && value <= balance)
  const canWithdraw = $derived(
    parsed.ok && value > 0n && value <= (view?.saved ?? 0n),
  )

  async function run(label: string, write: () => Promise<`0x${string}`>) {
    const ok = await flow.run([
      { label, hint: "Confirm in MetaMask", run: write },
    ])
    if (ok) {
      amount = ""
      onchange()
    }
  }

  const save = () =>
    run(`Move ${formatUsd(value)} to savings`, () =>
      vaultWrites.moveToSavings(potId, value),
    )
  const withdraw = () =>
    run(`Bring ${formatUsd(value)} back to the pot`, () =>
      vaultWrites.withdrawFromSavings(potId, value),
    )
  const harvest = () =>
    run("Collect the latest yield from Mezo", () => vaultWrites.harvestYield())
</script>

<section class="card sec" aria-labelledby="save-h">
  <div>
    <h2 id="save-h">Savings</h2>
    <p class="muted sub">
      Money the pot doesn't need yet earns in Mezo's MUSD savings vault. It
      stays this pot's money and comes back here.
    </p>
  </div>

  {#if loadError}
    <Notice tone="error">Couldn't read savings from Mezo testnet.</Notice>
  {:else if view === null}
    <p class="muted">Loading…</p>
  {:else if !view.enabled}
    <p class="empty">Savings isn't turned on for this vault.</p>
  {:else}
    <dl class="figures">
      <div>
        <dt>Saved</dt>
        <dd class="num">{formatUsd(view.saved)}</dd>
      </div>
      <div>
        <dt>Yield waiting</dt>
        <dd class="num">{formatUsd(view.pending)}</dd>
      </div>
    </dl>

    <label class="f">
      <span>Amount</span>
      <span class="money">
        <span aria-hidden="true">$</span>
        <input
          bind:value={amount}
          inputmode="decimal"
          placeholder="0.00"
          aria-invalid={amount !== "" && !parsed.ok}
        />
      </span>
      {#if amount !== "" && !parsed.ok}<span class="err">{parsed.error}</span
        >{/if}
    </label>

    <div class="row">
      <Button disabled={!canSave || flow.running} onclick={save}
        >Move to savings</Button
      >
      <Button
        variant="secondary"
        disabled={!canWithdraw || flow.running}
        onclick={withdraw}>Bring back</Button
      >
    </div>
    <p class="hint">
      {formatUsd(balance)} spendable · yield is added to the pot on its next savings
      move.
      <button
        class="link"
        type="button"
        disabled={flow.running}
        onclick={harvest}>Check for new yield</button
      >
    </p>
    <Steps {flow} />
    {#if flow.error}<Notice tone="error">{flow.error}</Notice>{/if}
    <a
      class="vault"
      href={explorer.address(view.rate)}
      target="_blank"
      rel="noreferrer">Mezo savings vault (sMUSD) on the explorer</a
    >
  {/if}
</section>

<style>
  .sec {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  h2 {
    font-size: var(--text-lg);
  }
  .sub {
    font-size: var(--text-sm);
    margin-top: var(--space-1);
  }
  .empty {
    font-size: var(--text-sm);
    color: var(--ink-2);
    padding: var(--space-4);
    border-radius: var(--radius-md);
    background: var(--surface-2);
  }
  .figures {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
    margin: 0;
  }
  .figures div {
    padding: var(--space-3);
    border-radius: var(--radius-md);
    background: var(--palm-soft);
  }
  dt {
    font-size: var(--text-sm);
    color: var(--palm-ink);
  }
  dd {
    margin: 0;
    font-size: var(--text-xl);
    font-weight: 600;
  }
  .f {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    font-size: var(--text-sm);
    font-weight: 600;
  }
  .money {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: 0 var(--space-3);
    min-height: var(--tap);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-md);
    background: var(--surface);
  }
  .money input {
    flex: 1;
    min-width: 0;
    border: 0;
    background: transparent;
    min-height: var(--tap);
  }
  .err {
    color: var(--osun);
    font-weight: 400;
  }
  .row {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }
  .hint {
    font-size: var(--text-sm);
    color: var(--ink-2);
  }
  .link {
    border: 0;
    background: none;
    padding: 0;
    color: var(--indigo);
    font-weight: 600;
    text-decoration: underline;
    text-underline-offset: 0.18em;
  }
  .vault {
    font-size: var(--text-sm);
  }
</style>
