<script lang="ts">
  import type { Snippet } from "svelte"

  let {
    label,
    id,
    error,
    hint,
    children,
  }: {
    label: string
    id: string
    error?: string | undefined
    hint?: string | undefined
    children: Snippet<
      [{ id: string; describedBy: string | undefined; invalid: boolean }]
    >
  } = $props()

  const describedBy = $derived(
    [error ? `${id}-err` : null, hint ? `${id}-hint` : null]
      .filter(Boolean)
      .join(" ") || undefined,
  )
</script>

<div class="field" class:invalid={!!error}>
  <label for={id}>{label}</label>
  {@render children({ id, describedBy, invalid: !!error })}
  {#if hint && !error}<p class="hint" id="{id}-hint">{hint}</p>{/if}
  {#if error}<p class="error" id="{id}-err">{error}</p>{/if}
</div>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
  }
  label {
    font-size: var(--text-sm);
    font-weight: 600;
  }
  .field :global(:is(input, select, textarea)) {
    width: 100%;
    min-height: 3rem;
    padding: 0 var(--space-3);
    border: 0;
    border-radius: var(--radius-md);
    background: var(--surface);
    box-shadow: inset 0 0 0 1px var(--line-strong);
    transition-property: box-shadow;
    transition-duration: 150ms;
  }
  .field :global(textarea) {
    padding: var(--space-3);
    min-height: 5rem;
    resize: vertical;
  }
  .field :global(:is(input, select, textarea):focus-visible) {
    outline: none;
    box-shadow: inset 0 0 0 2px var(--indigo);
  }
  .invalid :global(:is(input, select, textarea)) {
    box-shadow: inset 0 0 0 2px var(--osun);
  }
  .hint {
    font-size: var(--text-xs);
    color: var(--ink-3);
  }
  .error {
    font-size: var(--text-sm);
    color: var(--osun);
  }
</style>
