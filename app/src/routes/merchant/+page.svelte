<!--
  Merchant subscribe-link maker (docs/wave2.md 2.2). No wallet needed: the
  link only describes the terms. The customer signs on their side and pays
  from a pot; the merchant never gets access to their wallet.
-->
<script lang="ts">
  import { isAddress } from "viem"

  import { formatUsd, parseUsdInput } from "#/money/format"
  import {
    buildSubscribeLink,
    DAY,
    formatEvery,
    MAX_MERCHANT_NAME,
  } from "#/sender/subscribe"
  import Button from "#/ui/Button.svelte"
  import Notice from "#/ui/Notice.svelte"
  import { page } from "$app/state"

  let merchant = $state("")
  let payee = $state("")
  let amount = $state("10.00")
  let every = $state("30")
  let copied = $state(false)

  const parsed = $derived(parseUsdInput(amount))
  const days = $derived(/^[0-9]{1,3}$/.test(every) ? BigInt(every) : 0n)
  const errors = $derived({
    merchant:
      merchant.trim() === ""
        ? "Your business name"
        : merchant.trim().length > MAX_MERCHANT_NAME
          ? `At most ${MAX_MERCHANT_NAME} characters`
          : null,
    payee: isAddress(payee.trim(), { strict: false })
      ? null
      : "The Mezo address that receives MUSD (0x…)",
    amount: parsed.ok && parsed.value > 0n ? null : "An amount above zero",
    every: days >= 1n && days <= 365n ? null : "1 to 365 days",
  })
  const valid = $derived(Object.values(errors).every((e) => e === null))
  const link = $derived(
    valid && parsed.ok
      ? buildSubscribeLink(page.url.origin, {
          payee: payee.trim(),
          amount: parsed.value,
          intervalDays: days,
          merchant,
        })
      : null,
  )

  async function copy() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      copied = true
      setTimeout(() => (copied = false), 2000)
    } catch {
      copied = false
    }
  }
</script>

<svelte:head><title>Subscribe link · Ìpín</title></svelte:head>

<div class="page">
  <header>
    <p class="eyebrow">For merchants</p>
    <h1>Get paid in MUSD every month</h1>
    <p class="muted">
      Make a link, share it with a customer. They pick one of their Ìpín pots
      and sign once. You're paid automatically on schedule, in MUSD on Mezo,
      with no card and no access to their wallet.
    </p>
  </header>

  <form class="card form" onsubmit={(e) => e.preventDefault()}>
    <label class="f">
      <span>Business name</span>
      <input
        bind:value={merchant}
        maxlength={MAX_MERCHANT_NAME}
        autocomplete="organization"
      />
      {#if merchant !== "" && errors.merchant}<span class="err"
          >{errors.merchant}</span
        >{/if}
    </label>
    <label class="f">
      <span>Pay to (your Mezo address)</span>
      <input
        class="mono"
        bind:value={payee}
        placeholder="0x…"
        spellcheck="false"
      />
      {#if payee !== "" && errors.payee}<span class="err">{errors.payee}</span
        >{/if}
    </label>
    <div class="two">
      <label class="f">
        <span>Amount</span>
        <span class="money">
          <span aria-hidden="true">$</span>
          <input
            bind:value={amount}
            inputmode="decimal"
            aria-invalid={!!errors.amount}
          />
        </span>
        {#if errors.amount}<span class="err">{errors.amount}</span>{/if}
      </label>
      <label class="f">
        <span>Every (days)</span>
        <input
          bind:value={every}
          inputmode="numeric"
          aria-invalid={!!errors.every}
        />
        {#if errors.every}<span class="err">{errors.every}</span>{/if}
      </label>
    </div>
  </form>

  {#if link && parsed.ok}
    <section class="card out" aria-label="Your link">
      <p>
        Customers will see <strong>{merchant.trim()}</strong>,
        <strong class="num">{formatUsd(parsed.value)}</strong>
        {formatEvery(days * DAY)}.
      </p>
      <code class="mono link">{link}</code>
      <Button onclick={copy}>{copied ? "Copied" : "Copy link"}</Button>
    </section>
  {:else}
    <Notice tone="info">Fill in the four fields to get your link.</Notice>
  {/if}
</div>

<style>
  .page {
    max-width: 32rem;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  header {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .form,
  .out {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
  }
  .f {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
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
  .link {
    display: block;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    background: var(--surface-2);
    font-size: var(--text-xs);
    overflow-wrap: anywhere;
  }
</style>
