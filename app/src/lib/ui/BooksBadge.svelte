<!--
  Reads booksBalance() straight from the Vault (I1): everything the vault holds
  covers everything it owes. Green when true, with the totals behind it.
-->
<script lang="ts">
  import { type Books, readBooks } from "#/chain/vault"
  import { formatUsd } from "#/money/format"

  let { refresh = 0 }: { refresh?: number } = $props()

  let books = $state<Books | null>(null)
  let failed = $state(false)

  $effect(() => {
    void refresh
    readBooks()
      .then((b) => {
        books = b
        failed = false
      })
      .catch(() => {
        failed = true
      })
  })
</script>

<div
  class="books"
  class:ok={books?.balanced}
  class:bad={books && !books.balanced}
  role="status"
>
  <span class="seal" aria-hidden="true">
    {#if books && !books.balanced}
      <svg viewBox="0 0 20 20"><path d="M10 5.5v5.5M10 14.2v.3" /></svg>
    {:else}
      <svg viewBox="0 0 20 20"><path d="M5 10.5l3 3 7-7" /></svg>
    {/if}
  </span>
  <div class="text">
    {#if books}
      <p class="title">
        {books.balanced ? "Books balance" : "Books don't balance"}
      </p>
      <p class="detail num">
        Vault holds {formatUsd(books.assets)} · owes {formatUsd(
          books.liabilities,
        )}
      </p>
    {:else if failed}
      <p class="title">Books: can't read right now</p>
      <p class="detail">Mezo testnet didn't answer. We'll try again.</p>
    {:else}
      <p class="title">Checking the books…</p>
      <p class="detail">Reading booksBalance() on Mezo</p>
    {/if}
  </div>
</div>

<style>
  .books {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4) var(--space-3) var(--space-3);
    border-radius: var(--radius-pill);
    background: var(--surface);
    box-shadow: var(--shadow-1);
    width: fit-content;
    max-width: 100%;
  }
  .seal {
    flex: none;
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    background: var(--surface-2);
    color: var(--ink-3);
  }
  .ok .seal {
    background: var(--leaf);
    color: var(--surface);
  }
  .bad .seal {
    background: var(--osun);
    color: var(--surface);
  }
  svg {
    width: 1.1rem;
    height: 1.1rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.4;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .title {
    font-weight: 600;
    font-size: var(--text-sm);
    line-height: 1.3;
  }
  .ok .title {
    color: var(--leaf);
  }
  .bad .title {
    color: var(--osun);
  }
  .detail {
    font-size: var(--text-xs);
    color: var(--ink-2);
  }
  .text {
    min-width: 0;
  }
</style>
