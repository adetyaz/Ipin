<script lang="ts">
  import type { Address } from "viem"

  import {
    type PotView,
    readPayees,
    readPot,
    readRequesters,
    vaultWrites,
  } from "#/chain/vault"
  import { wallet } from "#/chain/wallet.svelte"
  import { formatUsd, parseUsdInput, toInputString } from "#/money/format"
  import Allowance from "#/sender/Allowance.svelte"
  import Payees from "#/sender/Payees.svelte"
  import People from "#/sender/People.svelte"
  import Statement from "#/sender/Statement.svelte"
  import AdireSwatch from "#/ui/AdireSwatch.svelte"
  import Amount from "#/ui/Amount.svelte"
  import Button from "#/ui/Button.svelte"
  import CapMeter from "#/ui/CapMeter.svelte"
  import { Flow } from "#/ui/flow.svelte"
  import Notice from "#/ui/Notice.svelte"
  import Steps from "#/ui/Steps.svelte"
  import WalletGate from "#/ui/WalletGate.svelte"
  import { page } from "$app/state"

  const potId = $derived(
    /^\d+$/.test(page.params.id ?? "") ? BigInt(page.params.id ?? "0") : 0n,
  )

  let pot = $state<PotView | null | undefined>(undefined)
  let payees = $state<Address[] | null>(null)
  let requesters = $state<Address[] | null>(null)
  let refresh = $state(0)
  let error = $state<string | null>(null)

  let editingCap = $state(false)
  let capInput = $state("")
  const capFlow = new Flow()
  const parsedCap = $derived(parseUsdInput(capInput))

  async function load(id: bigint) {
    error = null
    try {
      pot = await readPot(id)
      const [p, r] = await Promise.all([readPayees(id), readRequesters(id)])
      payees = p
      requesters = r
    } catch {
      error = "We couldn't read this pot from Mezo testnet. Try again."
    }
  }

  $effect(() => {
    void refresh
    if (wallet.ready && potId > 0n) void load(potId)
  })

  const bump = () => (refresh += 1)
  const mine = $derived(
    !!pot &&
      !!wallet.account &&
      pot.owner.toLowerCase() === wallet.account.toLowerCase(),
  )

  async function saveCap() {
    if (!parsedCap.ok || !pot) return
    const cap = parsedCap.value
    const id = pot.id
    const ok = await capFlow.run([
      {
        label: `Set the monthly limit to ${formatUsd(cap)}`,
        hint: "Confirm in MetaMask",
        run: () => vaultWrites.setCap(id, cap),
      },
    ])
    if (ok) {
      editingCap = false
      bump()
    }
  }
</script>

<svelte:head><title>{pot?.name ?? "Pot"} · Ìpín</title></svelte:head>

<WalletGate>
  <a class="back" href="/send">← Your pots</a>

  {#if error}
    <Notice tone="error">{error}</Notice>
  {:else if pot === undefined}
    <p class="muted">Reading the pot…</p>
  {:else if pot === null}
    <div class="card">
      <h1>Pot not found</h1>
      <p class="muted">There's no pot #{potId.toString()}.</p>
    </div>
  {:else}
    <div class="layout">
      <header class="hero card">
        <div class="cloth"><AdireSwatch seed={pot.name} /></div>
        <div class="hero-body">
          <p class="eyebrow">Pot #{pot.id.toString()}</p>
          <h1>{pot.name}</h1>
          <div class="bal"><Amount value={pot.balance} size="xl" naira /></div>
          <CapMeter spent={pot.spent} cap={pot.cap} />
          {#if !mine}
            <Notice tone="warn"
              >This pot belongs to another wallet. You can look, but only its
              owner can change it.</Notice
            >
          {:else if editingCap}
            <form
              class="cap-form"
              onsubmit={(e) => {
                e.preventDefault()
                void saveCap()
              }}
            >
              <label for="cap">Monthly limit</label>
              <div class="cap-row">
                <span class="money"
                  ><span aria-hidden="true">$</span><input
                    id="cap"
                    bind:value={capInput}
                    inputmode="decimal"
                  /></span
                >
                <Button
                  type="submit"
                  busy={capFlow.running}
                  disabled={!parsedCap.ok}>Save</Button
                >
                <Button variant="ghost" onclick={() => (editingCap = false)}
                  >Cancel</Button
                >
              </div>
              {#if !parsedCap.ok}<p class="err">{parsedCap.error}</p>{/if}
            </form>
          {:else}
            <div class="hero-actions">
              <Button variant="secondary" href="/send/deposit">Add money</Button
              >
              <Button
                variant="ghost"
                onclick={() => {
                  capInput = toInputString(pot?.cap ?? 0n)
                  editingCap = true
                }}>Change limit</Button
              >
            </div>
          {/if}
          <Steps flow={capFlow} />
        </div>
      </header>

      {#if mine}
        <div class="col">
          <Payees
            potId={pot.id}
            {payees}
            requesters={requesters ?? []}
            onchange={bump}
          />
          <People
            potId={pot.id}
            potName={pot.name}
            {requesters}
            payees={payees ?? []}
            onchange={bump}
          />
          <Allowance
            potId={pot.id}
            payees={payees ?? []}
            {refresh}
            onchange={bump}
          />
        </div>
      {/if}
      <div class="col">
        <Statement potId={pot.id} {refresh} />
      </div>
    </div>
  {/if}
</WalletGate>

<style>
  .back {
    display: inline-flex;
    align-items: center;
    min-height: var(--tap);
    font-size: var(--text-sm);
    font-weight: 600;
    text-decoration: none;
    margin-bottom: var(--space-2);
  }
  .layout {
    display: grid;
    gap: var(--space-4);
  }
  @media (min-width: 960px) {
    .layout {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      align-items: start;
    }
    .hero {
      grid-column: 1 / -1;
    }
  }
  .col {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    min-width: 0;
  }
  .hero {
    padding: 0;
    overflow: hidden;
    display: grid;
  }
  @media (min-width: 720px) {
    .hero {
      grid-template-columns: 9rem 1fr;
    }
  }
  .cloth {
    height: 4.5rem;
  }
  @media (min-width: 720px) {
    .cloth {
      height: 100%;
    }
  }
  .hero-body {
    padding: var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  h1 {
    font-size: var(--text-2xl);
  }
  .bal {
    margin: var(--space-1) 0 var(--space-2);
  }
  .hero-actions {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }
  .cap-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .cap-form label {
    font-size: var(--text-sm);
    font-weight: 600;
  }
  .cap-row {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    flex-wrap: wrap;
  }
  .money {
    position: relative;
    flex: 0 1 9rem;
  }
  .money span {
    position: absolute;
    left: var(--space-3);
    top: 50%;
    translate: 0 -50%;
    color: var(--ink-3);
  }
  .money input {
    width: 100%;
    min-height: var(--tap);
    padding: 0 var(--space-3) 0 1.6rem;
    border: 0;
    border-radius: var(--radius-md);
    background: var(--surface);
    box-shadow: inset 0 0 0 1px var(--line-strong);
  }
  .err {
    font-size: var(--text-sm);
    color: var(--osun);
  }
</style>
