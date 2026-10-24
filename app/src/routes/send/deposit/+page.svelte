<script lang="ts">
  import {
    approveMusd,
    newIdFrom,
    type PotView,
    readMusdBalance,
    readPotsOf,
    vaultWrites,
  } from "#/chain/vault"
  import { wallet } from "#/chain/wallet.svelte"
  import { formatUsd } from "#/money/format"
  import type { SplitPlan } from "#/money/split"
  import Button from "#/ui/Button.svelte"
  import { Flow } from "#/ui/flow.svelte"
  import Notice from "#/ui/Notice.svelte"
  import SplitEditor from "#/ui/SplitEditor.svelte"
  import Steps from "#/ui/Steps.svelte"
  import WalletGate from "#/ui/WalletGate.svelte"

  let pots = $state<PotView[] | null>(null)
  let chosen = $state<Record<string, boolean>>({})
  let balance = $state<bigint | null>(null)
  let total = $state("10.00")
  let pieces = $state<string[]>([])
  let restIndex = $state(0)
  let split = $state<{ total: bigint; plan: SplitPlan } | null>(null)
  let splitId = $state<bigint | null>(null)
  let loadError = $state<string | null>(null)
  const flow = new Flow()

  $effect(() => {
    if (!wallet.ready || !wallet.account) return
    const owner = wallet.account
    Promise.all([readPotsOf(owner), readMusdBalance(owner)])
      .then(([mine, bal]) => {
        pots = mine
        balance = bal
        chosen = Object.fromEntries(mine.map((p) => [p.id.toString(), true]))
        // Default: the first pot gets 75%, the last takes the rest.
        pieces = mine.map((_, i) => (i === 0 && mine.length > 1 ? "7.50" : ""))
        restIndex = mine.length > 0 ? mine.length - 1 : 0
      })
      .catch(() => (loadError = "We couldn't read your pots. Try again."))
  })

  const included = $derived((pots ?? []).filter((p) => chosen[p.id.toString()]))

  function toggle(id: bigint) {
    chosen[id.toString()] = !chosen[id.toString()]
    splitId = null
    pieces = included.map(() => "")
    restIndex = included.length > 0 ? included.length - 1 : 0
  }

  const formError = $derived.by(() => {
    if (included.length === 0) return "Choose at least one pot."
    if (!split || !split.plan.ok) return "Fix the split so it adds up."
    if (balance !== null && split.total > balance) {
      return "Your wallet doesn't have enough MUSD for this amount."
    }
    return null
  })

  async function submit() {
    if (formError || !split || !split.plan.ok) return
    const plan = split.plan
    const amount = split.total
    const ids = included.map((p) => p.id)
    const rest = ids[restIndex]
    if (rest === undefined) return
    await flow.run([
      {
        label: "Save how this deposit splits",
        hint: "Confirm in MetaMask",
        run: async () => {
          if (splitId !== null) return null
          const hash = await vaultWrites.createSplit(ids, plan.bps, rest)
          splitId = await newIdFrom(hash, "SplitCreated")
          return hash
        },
      },
      {
        label: `Let the vault take ${formatUsd(amount)} MUSD`,
        hint: "Approve the amount in MetaMask",
        run: () => approveMusd(amount),
      },
      {
        label: `Add ${formatUsd(amount)} to your pots`,
        hint: "Confirm in MetaMask",
        run: async () => {
          if (splitId === null) throw new Error("The split wasn't saved.")
          return vaultWrites.deposit(splitId, amount)
        },
      },
    ])
  }
</script>

<svelte:head><title>Add money · Ìpín</title></svelte:head>

<WalletGate>
  <div class="page">
    <a class="back" href="/send">← Your pots</a>
    <h1>Add money</h1>

    {#if loadError}
      <Notice tone="error">{loadError}</Notice>
    {:else if pots === null}
      <p class="muted">Reading your pots…</p>
    {:else if pots.length === 0}
      <div class="card">
        <p>You don't have any pots yet.</p>
        <Button href="/send/new">Create pots</Button>
      </div>
    {:else if flow.done && split}
      <div class="card stack">
        <Notice tone="success" title="Money added">
          {formatUsd(split.total)} went into your pots, split exactly as you set.
        </Notice>
        <Steps {flow} />
        <Button href="/send" size="lg" full>See your pots</Button>
      </div>
    {:else}
      {#if pots.length > 1}
        <fieldset class="card choose">
          <legend>Which pots?</legend>
          {#each pots as pot (pot.id)}
            <label class="check">
              <input
                type="checkbox"
                checked={chosen[pot.id.toString()]}
                onchange={() => toggle(pot.id)}
                disabled={flow.running}
              />
              <span>{pot.name}</span>
              <span class="muted num">{formatUsd(pot.balance)} now</span>
            </label>
          {/each}
        </fieldset>
      {/if}

      <section class="card">
        <SplitEditor
          names={included.map((p) => p.name)}
          bind:total
          bind:pieces
          bind:restIndex
          bind:result={split}
          {balance}
        />
      </section>

      {#if formError && !flow.running}
        <p class="form-error">{formError}</p>
      {/if}
      <Steps {flow} />
      {#if flow.error}
        <Notice tone="error" title="That step didn't go through">
          Press the button again to retry; steps already done are skipped.
        </Notice>
      {/if}
      <Button
        size="lg"
        full
        busy={flow.running}
        disabled={!!formError}
        onclick={submit}
      >
        {flow.running
          ? "Working… keep this page open"
          : split?.plan.ok
            ? `Add ${formatUsd(split.total)}`
            : "Add money"}
      </Button>
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
  .choose {
    border: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  legend {
    font-family: var(--font-display);
    font-size: var(--text-lg);
    padding: 0;
    margin-bottom: var(--space-2);
    float: left;
  }
  .check {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-height: var(--tap);
    cursor: pointer;
    clear: both;
  }
  .check input {
    width: 1.25rem;
    height: 1.25rem;
    accent-color: var(--indigo);
    margin: 0;
  }
  .check span:nth-child(2) {
    font-weight: 600;
  }
  .check .muted {
    margin-left: auto;
    font-size: var(--text-sm);
  }
  .form-error {
    font-size: var(--text-sm);
    color: var(--osun);
    font-weight: 600;
  }
</style>
