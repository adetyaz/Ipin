<!--
  x402 agent budget, step A (docs/wave2.md 3): a weekly top-up of an AI
  agent's own wallet from this pot. One transaction: add the agent as a payee
  and create the schedule. The agent spends the float with a normal x402
  client; it can never reach the pot itself.
-->
<script lang="ts">
  import { type Address, getAddress, isAddress } from "viem"

  import { subscribeInOneTransaction } from "#/chain/vault"
  import { formatUsd, parseUsdInput } from "#/money/format"
  import { setPayeeLabel } from "#/storage"
  import { nowSeconds } from "#/text"
  import Button from "#/ui/Button.svelte"
  import { Flow } from "#/ui/flow.svelte"
  import Notice from "#/ui/Notice.svelte"
  import Steps from "#/ui/Steps.svelte"

  import { floatFitsCap, floatPerPeriod, WEEK } from "./agent"

  let {
    potId,
    cap,
    payees,
    requesters,
    onchange,
  }: {
    potId: bigint
    cap: bigint
    payees: Address[]
    requesters: Address[]
    onchange: () => void
  } = $props()

  let open = $state(false)
  let agent = $state("")
  let amount = $state("0.50")
  const flow = new Flow()

  const parsed = $derived(parseUsdInput(amount))
  const validAddress = $derived(isAddress(agent.trim(), { strict: false }))
  const address = $derived(validAddress ? getAddress(agent.trim()) : null)
  const isRequester = $derived(
    !!address &&
      requesters.some((r) => r.toLowerCase() === address.toLowerCase()),
  )
  const fits = $derived(parsed.ok && floatFitsCap(parsed.value, cap))
  const canCreate = $derived(
    !!address &&
      parsed.ok &&
      parsed.value > 0n &&
      !isRequester &&
      !flow.running,
  )

  async function create() {
    if (!canCreate || !address || !parsed.ok) return
    const to = address
    const value = parsed.value
    const ok = await flow.run([
      {
        label: `Give the agent ${formatUsd(value)} a week`,
        hint: "One transaction: adds the agent as a payee and starts the weekly top-up.",
        run: () =>
          subscribeInOneTransaction({
            potId,
            payee: to,
            amount: value,
            interval: WEEK,
            start: nowSeconds(),
            alreadyPayee: payees.some(
              (p) => p.toLowerCase() === to.toLowerCase(),
            ),
          }),
      },
    ])
    if (ok) {
      setPayeeLabel(to, "AI agent")
      open = false
      agent = ""
      onchange()
    }
  }
</script>

<section class="card sec" aria-labelledby="agent-h">
  <div>
    <h2 id="agent-h">AI agent budget</h2>
    <p class="muted sub">
      Top up an agent's wallet every week so it can pay for APIs on its own
      (x402). It only ever holds the float, never this pot.
    </p>
  </div>

  {#if open}
    <form
      class="add"
      onsubmit={(e) => {
        e.preventDefault()
        void create()
      }}
    >
      <label class="f">
        <span>Agent's wallet address</span>
        <input
          class="mono"
          bind:value={agent}
          placeholder="0x…"
          spellcheck="false"
        />
        {#if agent !== "" && !validAddress}<span class="err"
            >Not a valid address.</span
          >{/if}
        {#if isRequester}<span class="err"
            >This address can ask for money from this pot, so it can't also be
            paid by it.</span
          >{/if}
      </label>
      <label class="f">
        <span>Every week</span>
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
      {#if parsed.ok && !fits}
        <Notice tone="warn" title="Some weeks won't top up">
          Up to {formatUsd(floatPerPeriod(parsed.value))} can land in one 30-day period,
          above this pot's {formatUsd(cap)} limit. Those top-ups wait until the limit
          resets. Lower the amount or raise the limit.
        </Notice>
      {/if}
      <p class="hint">
        First top-up today, then every 7 days. Stop it any time under
        Subscriptions.
      </p>
      <div class="row">
        <Button
          variant="secondary"
          onclick={() => (open = false)}
          disabled={flow.running}>Cancel</Button
        >
        <Button type="submit" busy={flow.running} disabled={!canCreate}
          >Start weekly budget</Button
        >
      </div>
    </form>
  {:else}
    <Button variant="secondary" onclick={() => (open = true)}
      >+ Give an agent a weekly budget</Button
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
  input {
    min-height: 3rem;
    padding: 0 var(--space-3);
    border: 0;
    border-radius: var(--radius-md);
    background: var(--surface);
    box-shadow: inset 0 0 0 1px var(--line-strong);
    width: 100%;
  }
  input:focus-visible {
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
