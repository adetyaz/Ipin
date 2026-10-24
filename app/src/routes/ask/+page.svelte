<script lang="ts">
  import { joinedPots } from "#/storage"
  import AdireSwatch from "#/ui/AdireSwatch.svelte"

  const pots = joinedPots()
</script>

<svelte:head><title>My pots · Ìpín</title></svelte:head>

<div class="page">
  <h1>Your pots</h1>
  {#if pots.length === 0}
    <div class="card stack">
      <p>You haven't joined a pot on this phone yet.</p>
      <p class="muted">
        Open the invite link the sender shared with you on WhatsApp. If you used
        a different phone or browser before, ask for a new link.
      </p>
    </div>
  {:else}
    <ul class="list">
      {#each pots as p (p.code)}
        <li>
          <a href="/ask/{encodeURIComponent(p.code)}">
            <span class="sw"><AdireSwatch seed={p.potName ?? p.potId} /></span>
            <span class="t">
              <span class="name">{p.potName ?? `Pot #${p.potId}`}</span>
              <span class="muted">You ask as {p.label}</span>
            </span>
            <span aria-hidden="true" class="go">→</span>
          </a>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .page {
    max-width: var(--content);
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  h1 {
    font-size: var(--text-2xl);
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  a {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3);
    border-radius: var(--radius-lg);
    background: var(--surface);
    box-shadow: var(--shadow-1);
    color: inherit;
    text-decoration: none;
  }
  .sw {
    width: 3rem;
    height: 3rem;
    border-radius: var(--radius-md);
    overflow: hidden;
    flex: none;
  }
  .t {
    display: flex;
    flex-direction: column;
    font-size: var(--text-sm);
  }
  .name {
    font-weight: 600;
    font-size: var(--text-md);
  }
  .go {
    margin-left: auto;
    color: var(--ink-3);
    padding-right: var(--space-2);
  }
</style>
