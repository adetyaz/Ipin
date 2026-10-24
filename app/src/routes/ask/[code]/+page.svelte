<!--
  The requester's home for one pot: "New request" and "My requests".
  No wallet, no gas: the browser key signs, the relayer carries it.
-->
<script lang="ts">
  import type { Request } from "@ipin/shared"
  import type { Address } from "viem"

  import { relayer, relayerUrl } from "#/api/relayer"
  import { explorer } from "#/chain/client"
  import { deployment } from "#/chain/deployment"
  import { readIsRequester, readPayees, readPot } from "#/chain/vault"
  import { formatUsd, parseUsdInput } from "#/money/format"
  import { requesterAccount, signRequestBody } from "#/requester/key"
  import {
    type RequestFormInput,
    validateRequestForm,
  } from "#/requester/requestForm"
  import { joinedPots } from "#/storage"
  import { formatWhen, shortAddress } from "#/text"
  import AdireSwatch from "#/ui/AdireSwatch.svelte"
  import Amount from "#/ui/Amount.svelte"
  import Button from "#/ui/Button.svelte"
  import Notice from "#/ui/Notice.svelte"
  import StatusPill from "#/ui/StatusPill.svelte"
  import { goto } from "$app/navigation"
  import { page } from "$app/state"

  const code = $derived(page.params.code ?? "")
  const joined = $derived(joinedPots().find((p) => p.code === code))
  const me = requesterAccount().address

  let potName = $state<string | null>(null)
  let remaining = $state<bigint | null>(null)
  let payees = $state<Address[] | null>(null)
  let registered = $state<boolean | null>(null)
  let mine = $state<Request[] | null>(null)
  let chainError = $state<string | null>(null)

  // Example at testnet scale: 5 bags × $1.00 = $5.00.
  let form = $state<RequestFormInput>({
    item: "",
    quantity: "",
    unitPrice: "",
    vendor: "",
    payee: "",
    note: "",
  })
  let touched = $state(false)
  let sending = $state(false)
  let sendError = $state<string | null>(null)
  let sentId = $state<string | null>(null)

  const names = $derived(joined?.payeeNames ?? {})
  const payeeName = (a: string) => names[a.toLowerCase()]

  const result = $derived(validateRequestForm(form, payees ?? [], me))
  const total = $derived(result.ok ? result.value.total : result.total)
  const errors = $derived(touched && !result.ok ? result.errors : {})
  const unitParsed = $derived(parseUsdInput(form.unitPrice))
  const unitShown = $derived(unitParsed.ok ? formatUsd(unitParsed.value) : "")

  async function loadChain(potId: bigint) {
    if (deployment.status !== "deployed") return
    try {
      const [pot, p, reg] = await Promise.all([
        readPot(potId),
        readPayees(potId),
        readIsRequester(potId, me),
      ])
      potName = pot?.name ?? null
      remaining = pot
        ? pot.remaining < pot.balance
          ? pot.remaining
          : pot.balance
        : null
      payees = p
      registered = reg
      chainError = null
      if (p.length === 1 && form.payee === "" && p[0]) pickPayee(p[0])
    } catch {
      chainError =
        "Couldn't reach Mezo testnet. Pull to refresh or try again shortly."
    }
  }

  async function loadMine(potId: bigint) {
    if (!relayerUrl) return
    try {
      const all = await relayer.listRequests({ potId })
      mine = all
        .filter((r) => r.requester.toLowerCase() === me.toLowerCase())
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    } catch {
      /* keep the last list; the poll retries */
    }
  }

  $effect(() => {
    if (!joined) {
      void goto(`/i/${encodeURIComponent(code)}`, { replaceState: true })
      return
    }
    const potId = BigInt(joined.potId)
    void loadChain(potId)
    void loadMine(potId)
    const t = setInterval(() => {
      void loadMine(potId)
      if (registered !== true) void loadChain(potId)
    }, 8000)
    return () => clearInterval(t)
  })

  function pickPayee(a: Address) {
    form.payee = a
    const n = payeeName(a)
    if (n && form.vendor.trim() === "") form.vendor = n
  }

  async function submit() {
    touched = true
    sendError = null
    if (!result.ok || !joined) return
    const v = result.value
    sending = true
    try {
      const body: Record<string, unknown> = {
        potId: joined.potId,
        payee: v.payee,
        item: v.item,
        quantity: v.quantity.toString(),
        unitPrice: v.unitPrice.toString(),
        vendor: v.vendor,
        ...(v.note ? { note: v.note } : {}),
        requester: me,
      }
      const signed = await signRequestBody(body)
      const { id } = await relayer.createRequest(signed)
      sentId = id
      form = {
        item: "",
        quantity: "",
        unitPrice: "",
        vendor: "",
        payee: form.payee,
        note: "",
      }
      touched = false
      await loadMine(BigInt(joined.potId))
    } catch (err) {
      sendError =
        err instanceof Error ? err.message : "Couldn't send the request."
    } finally {
      sending = false
    }
  }
</script>

<svelte:head><title>Ask · {potName ?? "Ìpín"}</title></svelte:head>

{#if joined}
  <div class="layout">
    <header class="pot">
      <div class="cloth"><AdireSwatch seed={potName ?? joined.potId} /></div>
      <div>
        <p class="eyebrow">You ask as {joined.label}</p>
        <h1>{potName ?? `Pot #${joined.potId}`}</h1>
        {#if remaining !== null}
          <p class="muted small">
            Up to <strong>{formatUsd(remaining)}</strong> can be approved right now.
          </p>
        {/if}
      </div>
    </header>

    {#if deployment.status !== "deployed"}
      <Notice tone="info" title="Not deployed yet"
        >Ìpín isn't on Mezo testnet yet. Requests open once it is.</Notice
      >
    {/if}
    {#if chainError}<Notice tone="error">{chainError}</Notice>{/if}

    <section class="card form-card" aria-labelledby="new-h">
      <h2 id="new-h">New request</h2>

      {#if registered === false}
        <Notice tone="warn" title="Almost there">
          The sender still needs to finish adding you. You can fill this in now
          and send it once they have. This page checks every few seconds.
        </Notice>
      {/if}

      {#if sentId}
        <Notice tone="success" title="Request sent">
          The sender will see it on their phone. You'll see it below when it's
          paid.
        </Notice>
      {/if}

      <form
        class="form"
        novalidate
        onsubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <div class="f">
          <label for="item">What do you need?</label>
          <input
            id="item"
            bind:value={form.item}
            placeholder="Cement bag 50kg"
            autocomplete="off"
            aria-invalid={!!errors.item}
            aria-describedby={errors.item ? "item-err" : undefined}
          />
          {#if errors.item}<p class="err" id="item-err">{errors.item}</p>{/if}
        </div>

        <div class="pair">
          <div class="f">
            <label for="qty">How many?</label>
            <input
              id="qty"
              bind:value={form.quantity}
              inputmode="numeric"
              placeholder="5"
              aria-invalid={!!errors.quantity}
              aria-describedby={errors.quantity ? "qty-err" : undefined}
            />
            {#if errors.quantity}<p class="err" id="qty-err">
                {errors.quantity}
              </p>{/if}
          </div>
          <div class="f">
            <label for="price">Price each</label>
            <span class="money">
              <span aria-hidden="true">$</span>
              <input
                id="price"
                bind:value={form.unitPrice}
                inputmode="decimal"
                placeholder="1.00"
                aria-invalid={!!errors.unitPrice}
                aria-describedby={errors.unitPrice ? "price-err" : undefined}
              />
            </span>
            {#if errors.unitPrice}<p class="err" id="price-err">
                {errors.unitPrice}
              </p>{/if}
          </div>
        </div>

        <fieldset
          class="f payees"
          aria-describedby={errors.payee ? "payee-err" : undefined}
        >
          <legend>Who gets paid?</legend>
          {#if payees === null}
            <p class="muted small">Loading the approved vendors…</p>
          {:else if payees.length === 0}
            <p class="empty">
              The sender hasn't approved any vendors yet. Ask them to add the
              vendor you buy from.
            </p>
          {:else}
            {#each payees as p (p)}
              <label class="payee" class:on={form.payee === p}>
                <input
                  type="radio"
                  name="payee"
                  value={p}
                  checked={form.payee === p}
                  onchange={() => pickPayee(p)}
                />
                <span class="pn">{payeeName(p) ?? "Approved vendor"}</span>
                <span class="mono pa">{shortAddress(p)}</span>
              </label>
            {/each}
          {/if}
          {#if errors.payee}<p class="err" id="payee-err">
              {errors.payee}
            </p>{/if}
        </fieldset>

        <div class="f">
          <label for="vendor">Vendor name</label>
          <input
            id="vendor"
            bind:value={form.vendor}
            placeholder="Vendor Y"
            autocomplete="off"
            aria-invalid={!!errors.vendor}
            aria-describedby={errors.vendor ? "vendor-err" : "vendor-hint"}
          />
          {#if errors.vendor}
            <p class="err" id="vendor-err">{errors.vendor}</p>
          {:else}
            <p class="hint" id="vendor-hint">
              The shop or person, as the sender knows them.
            </p>
          {/if}
        </div>

        <div class="f">
          <label for="note"
            >Note for the sender <span class="opt">(optional)</span></label
          >
          <textarea
            id="note"
            bind:value={form.note}
            rows="2"
            placeholder="For the foundation, second row"
          ></textarea>
          {#if errors.note}<p class="err">{errors.note}</p>{/if}
        </div>

        <div class="total" aria-live="polite">
          <span class="muted">Total</span>
          {#if total !== null}
            <span class="sum">
              <span class="calc num">{form.quantity.trim()} × {unitShown}</span>
              <Amount value={total} size="lg" naira />
            </span>
          {:else}
            <span class="muted">—</span>
          {/if}
        </div>
        {#if total !== null && remaining !== null && total > remaining}
          <Notice tone="warn">
            That's more than the {formatUsd(remaining)} that can be approved right
            now. The sender may need to add money.
          </Notice>
        {/if}

        {#if sendError}<Notice tone="error">{sendError}</Notice>{/if}
        <Button
          type="submit"
          size="lg"
          full
          busy={sending}
          disabled={registered === false || !relayerUrl || payees?.length === 0}
        >
          {sending ? "Sending…" : "Send request"}
        </Button>
        <p class="hint center">
          Free to send. Nothing is paid until the sender approves.
        </p>
      </form>
    </section>

    <section class="mine" aria-labelledby="mine-h">
      <h2 id="mine-h">My requests</h2>
      {#if !relayerUrl}
        <Notice tone="info"
          >Requests need the Ìpín relayer, which isn't set up for this app yet.</Notice
        >
      {:else if mine === null}
        <p class="muted small">Loading…</p>
      {:else if mine.length === 0}
        <p class="empty">
          No requests yet. Your first one shows up here with its status.
        </p>
      {:else}
        <ul class="list">
          {#each mine as r (r.id)}
            <li class="req" class:new={r.id === sentId}>
              <div class="row1">
                <span class="item">{r.item}</span>
                <StatusPill status={r.status} />
              </div>
              <div class="row2 num">
                <span
                  >{r.quantity.toString()} × {formatUsd(r.unitPrice)} · {r.vendor}</span
                >
                <strong>{formatUsd(r.amount)}</strong>
              </div>
              <div class="row3">
                <span>{formatWhen(r.createdAt)}</span>
                {#if r.txHash}
                  <a
                    href={explorer.tx(r.txHash)}
                    target="_blank"
                    rel="noreferrer">See payment</a
                  >
                {/if}
              </div>
              {#if r.status === "failed" && r.error}<p class="err">
                  {r.error}
                </p>{/if}
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  </div>
{/if}

<style>
  .layout {
    max-width: var(--content);
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }
  @media (min-width: 960px) {
    .layout {
      max-width: none;
      display: grid;
      grid-template-columns: minmax(0, 32rem) minmax(0, 1fr);
      align-items: start;
      gap: var(--space-5) var(--space-6);
    }
    .pot {
      grid-column: 1 / -1;
    }
    .layout > :global(.notice) {
      grid-column: 1 / -1;
    }
  }
  .pot {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }
  .cloth {
    flex: none;
    width: 4rem;
    height: 4rem;
    border-radius: var(--radius-md);
    overflow: hidden;
  }
  h1 {
    font-size: var(--text-2xl);
  }
  h2 {
    font-size: var(--text-lg);
  }
  .small {
    font-size: var(--text-sm);
  }
  .form-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .form {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .f {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
    border: 0;
    margin: 0;
    padding: 0;
  }
  .f > label,
  legend {
    font-size: var(--text-sm);
    font-weight: 600;
    padding: 0;
  }
  legend {
    margin-bottom: var(--space-1);
  }
  .opt {
    font-weight: 400;
    color: var(--ink-3);
  }
  .f input:not([type="radio"]),
  .f textarea {
    width: 100%;
    min-height: 3rem;
    padding: 0 var(--space-3);
    border: 0;
    border-radius: var(--radius-md);
    background: var(--surface);
    box-shadow: inset 0 0 0 1px var(--line-strong);
  }
  .f textarea {
    padding: var(--space-3);
    resize: vertical;
  }
  .f :is(input, textarea):focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 2px var(--indigo);
  }
  .f [aria-invalid="true"] {
    box-shadow: inset 0 0 0 2px var(--osun) !important;
  }
  .pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
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
    padding-left: 1.6rem !important;
  }
  .payees {
    gap: var(--space-2);
  }
  .payee {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: var(--space-3);
    min-height: 3.25rem;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    box-shadow: inset 0 0 0 1px var(--line-strong);
    cursor: pointer;
    transition-property: box-shadow, background-color;
    transition-duration: 150ms;
  }
  .payee.on {
    box-shadow: inset 0 0 0 2px var(--indigo);
    background: var(--indigo-soft);
  }
  .payee input {
    width: 1.25rem;
    height: 1.25rem;
    margin: 0;
    accent-color: var(--indigo);
  }
  .pn {
    font-weight: 600;
  }
  .pa {
    font-size: var(--text-xs);
    color: var(--ink-3);
  }
  .err {
    font-size: var(--text-sm);
    color: var(--osun);
  }
  .hint {
    font-size: var(--text-xs);
    color: var(--ink-3);
  }
  .center {
    text-align: center;
  }
  .empty {
    font-size: var(--text-sm);
    color: var(--ink-2);
    padding: var(--space-4);
    border-radius: var(--radius-md);
    background: var(--surface-2);
  }
  .total {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    padding-top: var(--space-3);
    border-top: 1px dashed var(--line-strong);
  }
  .sum {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--space-1);
  }
  .calc {
    font-size: var(--text-xs);
    color: var(--ink-3);
  }
  .mine {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .req {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-4);
    border-radius: var(--radius-lg);
    background: var(--surface);
    box-shadow: var(--shadow-1);
  }
  .req.new {
    box-shadow:
      inset 0 0 0 2px var(--palm),
      var(--shadow-1);
  }
  .row1,
  .row2,
  .row3 {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-2);
  }
  .item {
    font-weight: 600;
  }
  .row2 {
    font-size: var(--text-sm);
    color: var(--ink-2);
  }
  .row2 strong {
    color: var(--ink);
  }
  .row3 {
    font-size: var(--text-xs);
    color: var(--ink-3);
  }
  .row3 a {
    display: inline-flex;
    align-items: center;
    min-height: var(--tap);
    font-weight: 600;
    font-size: var(--text-sm);
  }
</style>
