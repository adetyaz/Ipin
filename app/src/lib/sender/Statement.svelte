<!-- Every money movement of the pot, read from chain events, with explorer links. -->
<script lang="ts">
  import { explorer } from "#/chain/client"
  import { readStatement, type StatementEntry } from "#/chain/vault"
  import { formatUsd } from "#/money/format"
  import { payeeLabel } from "#/storage"
  import { formatWhen, shortAddress } from "#/text"
  import Notice from "#/ui/Notice.svelte"

  let { potId, refresh }: { potId: bigint; refresh: number } = $props()

  let entries = $state<StatementEntry[] | null>(null)
  let error = $state(false)

  $effect(() => {
    void refresh
    readStatement(potId)
      .then((e) => {
        entries = e
        error = false
      })
      .catch(() => (error = true))
  })

  function title(e: StatementEntry): string {
    switch (e.kind) {
      case "credit":
        return "Money added"
      case "payment":
        return `Paid ${payeeLabel(e.payee) ?? shortAddress(e.payee)}`
      case "allowance":
        return `Allowance to ${payeeLabel(e.payee) ?? shortAddress(e.payee)}`
      case "fee":
        return "Relayer fee"
    }
  }

  const sign = (e: StatementEntry) =>
    e.kind === "credit" ? e.amount : -e.amount
</script>

<section class="card sec" aria-labelledby="stmt-h">
  <div>
    <h2 id="stmt-h">Statement</h2>
    <p class="muted sub">
      Read from Mezo, not from our database. Tap any line to see it on the
      explorer.
    </p>
  </div>

  {#if error}
    <Notice tone="error">Couldn't read the statement from Mezo testnet.</Notice>
  {:else if entries === null}
    <p class="muted">Reading the chain…</p>
  {:else if entries.length === 0}
    <p class="empty">Nothing yet. Deposits and payments appear here.</p>
  {:else}
    <ol class="list">
      {#each entries as e (`${e.tx}-${e.kind}-${e.amount}`)}
        <li>
          <a href={explorer.tx(e.tx)} target="_blank" rel="noreferrer">
            <span class="kind {e.kind}" aria-hidden="true"></span>
            <span class="what">
              <span class="t">{title(e)}</span>
              <span class="when"
                >{e.time !== undefined
                  ? formatWhen(e.time)
                  : `Block ${e.block}`}</span
              >
            </span>
            <span class="amt num" class:in={e.kind === "credit"}
              >{formatUsd(sign(e), { sign: true })}</span
            >
          </a>
        </li>
      {/each}
    </ol>
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
  .list {
    list-style: none;
    margin: 0 calc(-1 * var(--space-3));
    padding: 0;
  }
  a {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-height: 3.25rem;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    color: inherit;
    text-decoration: none;
  }
  @media (hover: hover) {
    a:hover {
      background: var(--surface-2);
    }
  }
  .kind {
    flex: none;
    width: 0.625rem;
    height: 0.625rem;
    border-radius: 50%;
    background: var(--ink-3);
  }
  .kind.credit {
    background: var(--leaf);
  }
  .kind.payment,
  .kind.allowance {
    background: var(--indigo);
  }
  .kind.fee {
    background: var(--line-strong);
  }
  .what {
    display: flex;
    flex-direction: column;
    min-width: 0;
    margin-right: auto;
  }
  .t {
    font-weight: 600;
    font-size: var(--text-sm);
  }
  .when {
    font-size: var(--text-xs);
    color: var(--ink-3);
  }
  .amt {
    font-weight: 600;
  }
  .amt.in {
    color: var(--leaf);
  }
</style>
