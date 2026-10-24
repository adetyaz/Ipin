<!--
  Monthly allowance (R9): a schedule pays one approved payee a fixed amount
  once every 30 days. Creating it is the sender's approval; the relayer runs
  it when due, inside the pot's cap.
-->
<script lang="ts">
  import type { Address } from "viem"

  import { readSchedules, type ScheduleView, vaultWrites } from "#/chain/vault"
  import { formatUsd, parseUsdInput } from "#/money/format"
  import { payeeLabel } from "#/storage"
  import { formatDay, nowSeconds, shortAddress } from "#/text"
  import Button from "#/ui/Button.svelte"
  import { Flow } from "#/ui/flow.svelte"
  import Notice from "#/ui/Notice.svelte"
  import Steps from "#/ui/Steps.svelte"

  let {
    potId,
    payees,
    refresh,
    onchange,
  }: {
    potId: bigint
    payees: Address[]
    refresh: number
    onchange: () => void
  } = $props()

  const MONTH = 30n * 24n * 60n * 60n // ADR-003: 30-day periods

  let schedules = $state<ScheduleView[] | null>(null)
  let loadError = $state(false)
  let open = $state(false)
  let payee = $state("")
  let amount = $state("1.00")
  let cancelling = $state<bigint | null>(null)
  const flow = new Flow()

  $effect(() => {
    void refresh
    readSchedules(potId)
      .then((s) => {
        schedules = s
        loadError = false
      })
      .catch(() => (loadError = true))
  })

  const parsed = $derived(parseUsdInput(amount))
  const canCreate = $derived(payee !== "" && parsed.ok && parsed.value > 0n)

  const name = (a: Address) => payeeLabel(a) ?? shortAddress(a)

  async function create() {
    if (!canCreate || !parsed.ok) return
    const to = payees.find((p) => p === payee)
    if (!to) return
    const value = parsed.value
    const ok = await flow.run([
      {
        label: `Pay ${name(to)} ${formatUsd(value)} every month`,
        hint: "Confirm in MetaMask",
        run: () =>
          vaultWrites.createSchedule(potId, to, value, nowSeconds(), MONTH),
      },
    ])
    if (ok) {
      open = false
      onchange()
    }
  }

  async function cancel(s: ScheduleView) {
    cancelling = s.id
    const ok = await flow.run([
      {
        label: `Stop the allowance to ${name(s.payee)}`,
        hint: "Confirm in MetaMask",
        run: () => vaultWrites.cancelSchedule(s.id),
      },
    ])
    cancelling = null
    if (ok) onchange()
  }

  const active = $derived((schedules ?? []).filter((s) => s.active))
</script>

<section class="card sec" aria-labelledby="allow-h">
  <div>
    <h2 id="allow-h">Monthly allowance</h2>
    <p class="muted sub">
      Pays a payee automatically every 30 days, within the pot's limit. No
      request needed.
    </p>
  </div>

  {#if loadError}
    <Notice tone="error">Couldn't read allowances from Mezo testnet.</Notice>
  {:else if schedules === null}
    <p class="muted">Loading…</p>
  {:else if active.length === 0 && !open}
    <p class="empty">No allowance yet.</p>
  {:else}
    <ul class="list">
      {#each active as s (s.id)}
        <li>
          <span class="amt num">{formatUsd(s.amount)}</span>
          <span class="who">
            <span class="label">to {name(s.payee)}</span>
            <span class="next">
              {s.nextDue <= nowSeconds()
                ? "Due now · the relayer pays it shortly"
                : `Next on ${formatDay(s.nextDue)}`}
            </span>
          </span>
          <Button
            variant="ghost"
            busy={cancelling === s.id}
            disabled={flow.running}
            onclick={() => cancel(s)}
          >
            Stop
          </Button>
        </li>
      {/each}
    </ul>
  {/if}

  {#if open}
    <form
      class="add"
      onsubmit={(e) => {
        e.preventDefault()
        void create()
      }}
    >
      {#if payees.length === 0}
        <Notice tone="warn"
          >Add a payee first. Allowances only pay approved payees.</Notice
        >
      {:else}
        <label class="f">
          <span>Pay to</span>
          <select bind:value={payee}>
            <option value="" disabled>Choose a payee</option>
            {#each payees as p (p)}
              <option value={p}>{name(p)}</option>
            {/each}
          </select>
        </label>
        <label class="f">
          <span>Amount each month</span>
          <span class="money">
            <span aria-hidden="true">$</span>
            <input
              bind:value={amount}
              inputmode="decimal"
              aria-invalid={!parsed.ok}
            />
          </span>
          {#if !parsed.ok}<span class="err">{parsed.error}</span>{/if}
        </label>
        <p class="hint">The first payment is due today. Then every 30 days.</p>
      {/if}
      <div class="row">
        <Button
          variant="secondary"
          onclick={() => (open = false)}
          disabled={flow.running}>Cancel</Button
        >
        <Button type="submit" busy={flow.running} disabled={!canCreate}
          >Start allowance</Button
        >
      </div>
    </form>
  {:else}
    <Button variant="secondary" onclick={() => (open = true)}
      >+ Set up an allowance</Button
    >
  {/if}

  <Steps {flow} />
</section>

<style>
  .sec {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
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
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) 0;
  }
  li + li {
    border-top: 1px solid var(--line);
  }
  .amt {
    font-family: var(--font-display);
    font-size: var(--text-lg);
  }
  .who {
    display: flex;
    flex-direction: column;
    margin-right: auto;
    min-width: 0;
  }
  .label {
    font-weight: 600;
  }
  .next {
    font-size: var(--text-xs);
    color: var(--ink-2);
  }
  .add {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4);
    border-radius: var(--radius-md);
    background: var(--surface-2);
  }
  .f {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .f > span:first-child {
    font-size: var(--text-sm);
    font-weight: 600;
  }
  .f :is(input, select) {
    min-height: 3rem;
    padding: 0 var(--space-3);
    border: 0;
    border-radius: var(--radius-md);
    background: var(--surface);
    box-shadow: inset 0 0 0 1px var(--line-strong);
    width: 100%;
  }
  .f :is(input, select):focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 2px var(--indigo);
  }
  .money {
    position: relative;
    display: block;
  }
  .money > span {
    position: absolute;
    left: var(--space-3);
    top: 50%;
    translate: 0 -50%;
    color: var(--ink-3);
  }
  .money input {
    padding-left: 1.6rem;
  }
  .err {
    font-size: var(--text-sm);
    color: var(--osun);
  }
  .hint {
    font-size: var(--text-xs);
    color: var(--ink-3);
  }
  .row {
    display: flex;
    gap: var(--space-2);
    justify-content: flex-end;
  }
</style>
