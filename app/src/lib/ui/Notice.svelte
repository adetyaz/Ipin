<script lang="ts">
  import type { Snippet } from "svelte"

  let {
    tone = "info",
    title,
    children,
  }: {
    tone?: "info" | "success" | "error" | "warn"
    title?: string
    children?: Snippet
  } = $props()
</script>

<div class="notice {tone}" role={tone === "error" ? "alert" : "status"}>
  <span class="mark" aria-hidden="true">
    {#if tone === "success"}
      <svg viewBox="0 0 20 20"><path d="M5 10.5l3 3 7-7" /></svg>
    {:else if tone === "error"}
      <svg viewBox="0 0 20 20"><path d="M10 5.5v5.5M10 14.2v.3" /></svg>
    {:else}
      <svg viewBox="0 0 20 20"><path d="M10 9v5M10 5.8v.3" /></svg>
    {/if}
  </span>
  <div class="body">
    {#if title}<p class="title">{title}</p>{/if}
    {#if children}<div class="text">{@render children()}</div>{/if}
  </div>
</div>

<style>
  .notice {
    display: flex;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    background: var(--indigo-soft);
    color: var(--ink);
  }
  .success {
    background: var(--leaf-soft);
  }
  .error {
    background: var(--osun-soft);
  }
  .warn {
    background: var(--palm-soft);
  }
  .mark {
    flex: none;
    display: grid;
    place-items: center;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 50%;
    background: var(--indigo);
    margin-top: 0.05rem;
  }
  .success .mark {
    background: var(--leaf);
  }
  .error .mark {
    background: var(--osun);
  }
  .warn .mark {
    background: var(--palm-ink);
  }
  svg {
    width: 1rem;
    height: 1rem;
    fill: none;
    stroke: var(--surface);
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .title {
    font-weight: 600;
  }
  .text :global(a) {
    color: inherit;
    font-weight: 600;
  }
  .body {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
</style>
