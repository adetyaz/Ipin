<!--
  People who can ask for money from this pot. The sender creates an invite
  link, shares it on WhatsApp, the requester's phone makes a key and claims
  the link, and the sender registers that key on-chain (ADR-012).
-->
<script lang="ts">
  import type { Address } from "viem"

  import { relayer, relayerUrl } from "#/api/relayer"
  import { vaultWrites } from "#/chain/vault"
  import {
    encodePayeeNames,
    payeeLabel,
    rememberInvite,
    type SentInvite,
    sentInvites,
  } from "#/storage"
  import { shortAddress } from "#/text"
  import Button from "#/ui/Button.svelte"
  import { Flow } from "#/ui/flow.svelte"
  import Notice from "#/ui/Notice.svelte"
  import Steps from "#/ui/Steps.svelte"

  let {
    potId,
    potName,
    requesters,
    payees,
    onchange,
  }: {
    potId: bigint
    potName: string
    requesters: Address[] | null
    payees: Address[]
    onchange: () => void
  } = $props()

  let invites = $state<SentInvite[]>([])
  let claimed = $state<Record<string, Address | null>>({})
  let label = $state("Site manager")
  let creating = $state(false)
  let createError = $state<string | null>(null)
  let copied = $state<string | null>(null)
  const flow = new Flow()

  const isRequester = (a: Address) =>
    requesters?.some((r) => r.toLowerCase() === a.toLowerCase()) ?? false

  async function refreshInvites() {
    invites = sentInvites(potId)
    if (!relayerUrl) return
    for (const inv of invites) {
      relayer
        .getInvite(inv.code)
        .then((r) => (claimed[inv.code] = r.claimedBy ?? null))
        .catch(() => undefined)
    }
  }

  $effect(() => {
    void potId
    void refreshInvites()
    // Pick up a claim made on the requester's phone while this page is open.
    const t = setInterval(() => void refreshInvites(), 8000)
    return () => clearInterval(t)
  })

  /** The link to share. The sender's payee names ride in the #fragment so
   *  the requester picks "Vendor Y", not 0x12…ab. */
  function inviteLink(code: string) {
    const names: Record<string, string> = {}
    for (const p of payees) {
      const l = payeeLabel(p)
      if (l) names[p.toLowerCase()] = l
    }
    return `${location.origin}/i/${encodeURIComponent(code)}${encodePayeeNames(names)}`
  }

  function whatsapp(inv: SentInvite) {
    const text = `I've set up the ${potName} pot on Ìpín. Open this link on your phone to ask for what's needed. No app or wallet needed: ${inviteLink(inv.code)}`
    return `https://wa.me/?text=${encodeURIComponent(text)}`
  }

  async function create() {
    creating = true
    createError = null
    try {
      const res = await relayer.createInvite(potId, label.trim() || "Requester")
      rememberInvite({
        code: res.code,
        url: inviteLink(res.code),
        potId: potId.toString(),
        label: label.trim() || "Requester",
        createdAt: new Date().toISOString(),
      })
      await refreshInvites()
    } catch (err) {
      createError =
        err instanceof Error ? err.message : "Couldn't create the invite."
    } finally {
      creating = false
    }
  }

  async function copy(inv: SentInvite) {
    try {
      await navigator.clipboard.writeText(inviteLink(inv.code))
      copied = inv.code
      setTimeout(() => (copied = null), 2000)
    } catch {
      copied = null
    }
  }

  async function register(inv: SentInvite, who: Address) {
    if (payees.some((p) => p.toLowerCase() === who.toLowerCase())) return
    const ok = await flow.run([
      {
        label: `Let ${inv.label} ask from ${potName}`,
        hint: "Confirm in MetaMask",
        run: () => vaultWrites.addRequester(potId, who),
      },
    ])
    if (ok) onchange()
  }

  const strangers = $derived(
    (requesters ?? []).filter(
      (r) =>
        !invites.some(
          (i) => claimed[i.code]?.toLowerCase() === r.toLowerCase(),
        ),
    ),
  )
</script>

<section class="card sec" aria-labelledby="people-h">
  <div>
    <h2 id="people-h">Who can ask</h2>
    <p class="muted sub">
      They raise requests from their phone. They can't move money, and they can
      never be paid from this pot.
    </p>
  </div>

  {#if invites.length === 0 && strangers.length === 0}
    <p class="empty">Nobody yet. Invite your site manager or a relative.</p>
  {/if}

  <ul class="list">
    {#each invites as inv (inv.code)}
      {@const who = claimed[inv.code] ?? null}
      <li>
        <div class="top">
          <span class="who">
            <span class="label">{inv.label}</span>
            {#if who && isRequester(who)}
              <span class="state ok">Can ask for money</span>
            {:else if who}
              <span class="state warn">Opened the link · one step left</span>
            {:else}
              <span class="state">Waiting for them to open the link</span>
            {/if}
          </span>
          {#if who}<span class="mono addr">{shortAddress(who)}</span>{/if}
        </div>
        {#if who && !isRequester(who)}
          {#if payees.some((p) => p.toLowerCase() === who.toLowerCase())}
            <Notice tone="warn">
              This phone's address is a payee of the pot, so it can't also ask.
            </Notice>
          {:else}
            <Button full busy={flow.running} onclick={() => register(inv, who)}>
              Finish adding {inv.label}
            </Button>
          {/if}
        {:else if !who}
          <div class="share">
            <Button href={whatsapp(inv)} target="_blank" rel="noreferrer">
              <svg class="wa" viewBox="0 0 24 24" aria-hidden="true"
                ><path
                  d="M12 3.2a8.7 8.7 0 0 0-7.5 13.1L3.3 20.8l4.6-1.2A8.7 8.7 0 1 0 12 3.2Z"
                /><path
                  d="M8.8 8.3c.2-.4.4-.4.7-.4h.5c.2 0 .4 0 .6.5l.8 1.8c.1.2.1.4 0 .6l-.4.6c-.1.2-.2.3 0 .6.4.7 1.4 1.8 2.6 2.3.3.1.4.1.6-.1l.7-.8c.2-.2.3-.2.6-.1l1.7.8c.3.1.4.2.4.4 0 .6-.3 1.3-.8 1.6-.6.4-1.6.6-3.4-.2-2.2-1-3.7-3.2-3.9-3.5-.2-.3-1-1.3-1-2.5 0-.9.4-1.4.6-1.6Z"
                  class="fill"
                /></svg
              >
              Share on WhatsApp
            </Button>
            <Button variant="secondary" onclick={() => copy(inv)}>
              {copied === inv.code ? "Copied" : "Copy link"}
            </Button>
          </div>
        {/if}
      </li>
    {/each}
    {#each strangers as r (r)}
      <li>
        <div class="top">
          <span class="who">
            <span class="label">Requester</span>
            <span class="state ok">Can ask for money</span>
          </span>
          <span class="mono addr">{shortAddress(r)}</span>
        </div>
      </li>
    {/each}
  </ul>

  {#if relayerUrl}
    <form
      class="invite"
      onsubmit={(e) => {
        e.preventDefault()
        void create()
      }}
    >
      <label class="f">
        <span>Invite someone</span>
        <input bind:value={label} maxlength="64" placeholder="Site manager" />
      </label>
      <Button type="submit" variant="secondary" busy={creating}
        >Create invite link</Button
      >
    </form>
    {#if createError}<Notice tone="error">{createError}</Notice>{/if}
  {:else}
    <Notice tone="info">
      Invites need the Ìpín relayer. Set PUBLIC_RELAYER_URL to turn them on.
    </Notice>
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
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .list:empty {
    display: none;
  }
  li {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    box-shadow: inset 0 0 0 1px var(--line);
  }
  .top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-2);
  }
  .who {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .label {
    font-weight: 600;
  }
  .state {
    font-size: var(--text-xs);
    color: var(--ink-2);
  }
  .state.ok {
    color: var(--leaf);
    font-weight: 600;
  }
  .state.warn {
    color: var(--palm-ink);
    font-weight: 600;
  }
  .addr {
    font-size: var(--text-xs);
    color: var(--ink-3);
  }
  .share {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }
  .wa {
    width: 1.15rem;
    height: 1.15rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
  }
  .wa .fill {
    fill: currentColor;
    stroke: none;
  }
  .invite {
    display: flex;
    gap: var(--space-2);
    align-items: flex-end;
    flex-wrap: wrap;
  }
  .f {
    flex: 1 1 12rem;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .f span {
    font-size: var(--text-sm);
    font-weight: 600;
  }
  .f input {
    min-height: var(--tap);
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
</style>
