<script lang="ts">
  import type { Request } from "@ipin/shared"
  import type { Address } from "viem"

  import { relayer, relayerUrl } from "#/api/relayer"
  import { type PotView, readFee, readPayees, readPotsOf } from "#/chain/vault"
  import { wallet } from "#/chain/wallet.svelte"
  import RequestCard from "#/sender/RequestCard.svelte"
  import Notice from "#/ui/Notice.svelte"
  import WalletGate from "#/ui/WalletGate.svelte"

  let pots = $state<Map<string, PotView>>(new Map())
  let payees = $state<Map<string, Address[]>>(new Map())
  let requests = $state<Request[] | null>(null)
  let fee = $state<bigint | null>(null)
  let error = $state<string | null>(null)

  async function load(owner: Address) {
    try {
      const mine = await readPotsOf(owner)
      pots = new Map(mine.map((p) => [p.id.toString(), p]))
      const lists = await Promise.all(mine.map((p) => readPayees(p.id)))
      payees = new Map(mine.map((p, i) => [p.id.toString(), lists[i] ?? []]))
      fee = await readFee().catch(() => null)
      await loadRequests()
    } catch (err) {
      error = err instanceof Error ? err.message : "Couldn't load requests."
    }
  }

  async function loadRequests() {
    if (!relayerUrl) return
    try {
      const all = await relayer.listRequests()
      requests = all
        .filter((r) => pots.has(r.potId.toString()))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      error = null
    } catch (err) {
      error = err instanceof Error ? err.message : "Couldn't load requests."
    }
  }

  async function changed() {
    if (wallet.account) await load(wallet.account)
  }

  $effect(() => {
    if (!wallet.ready || !wallet.account) return
    void load(wallet.account)
    const t = setInterval(() => void loadRequests(), 10_000)
    return () => clearInterval(t)
  })

  const pending = $derived(
    (requests ?? []).filter((r) => r.status === "pending"),
  )
  const done = $derived((requests ?? []).filter((r) => r.status !== "pending"))
</script>

<svelte:head><title>Requests · Ìpín</title></svelte:head>

<WalletGate>
  <div class="page">
    <h1>Requests</h1>

    {#if !relayerUrl}
      <Notice tone="info" title="Relayer not set up">
        Requests travel through the Ìpín relayer. Set PUBLIC_RELAYER_URL to see
        them.
      </Notice>
    {:else if error}
      <Notice tone="error">{error}</Notice>
    {/if}

    {#if relayerUrl && requests === null && !error}
      <p class="muted">Loading requests…</p>
    {:else if requests}
      <section aria-labelledby="pending-h">
        <h2 id="pending-h">
          Waiting for you <span class="count num">{pending.length}</span>
        </h2>
        {#if pending.length === 0}
          <p class="empty">
            Nothing to approve. When someone asks for money, it shows up here
            with every item priced.
          </p>
        {:else}
          <div class="list">
            {#each pending as r (r.id)}
              <RequestCard
                request={r}
                pot={pots.get(r.potId.toString())}
                payees={payees.get(r.potId.toString()) ?? []}
                {fee}
                onchange={changed}
              />
            {/each}
          </div>
        {/if}
      </section>

      {#if done.length > 0}
        <section aria-labelledby="done-h">
          <h2 id="done-h">Earlier</h2>
          <div class="list">
            {#each done as r (r.id)}
              <RequestCard
                request={r}
                pot={pots.get(r.potId.toString())}
                payees={payees.get(r.potId.toString()) ?? []}
                {fee}
                onchange={changed}
              />
            {/each}
          </div>
        </section>
      {/if}
    {/if}
  </div>
</WalletGate>

<style>
  .page {
    max-width: 40rem;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }
  h1 {
    font-size: var(--text-2xl);
  }
  h2 {
    font-size: var(--text-lg);
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }
  .count {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    font-weight: 700;
    padding: 0.1rem 0.5rem;
    border-radius: var(--radius-pill);
    background: var(--palm-soft);
    color: var(--palm-ink);
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .empty {
    font-size: var(--text-sm);
    color: var(--ink-2);
    padding: var(--space-5);
    border-radius: var(--radius-lg);
    background: var(--surface);
    box-shadow: var(--shadow-1);
  }
</style>
