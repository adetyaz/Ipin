<script lang="ts">
  import type { Snippet } from "svelte"
  import type { HTMLButtonAttributes } from "svelte/elements"

  type Props = HTMLButtonAttributes & {
    variant?: "primary" | "secondary" | "ghost" | "danger"
    size?: "md" | "lg"
    busy?: boolean
    full?: boolean
    href?: string
    children: Snippet
  }

  let {
    variant = "primary",
    size = "md",
    busy = false,
    full = false,
    href,
    children,
    disabled,
    type = "button",
    ...rest
  }: Props = $props()
</script>

{#if href}
  <a class="btn {variant} {size}" class:full {href}>
    {@render children()}
  </a>
{:else}
  <button
    class="btn {variant} {size}"
    class:full
    class:busy
    {type}
    disabled={disabled || busy}
    aria-busy={busy}
    {...rest}
  >
    {#if busy}<span class="spinner" aria-hidden="true"></span>{/if}
    {@render children()}
  </button>
{/if}

<style>
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    min-height: var(--tap);
    padding: 0 var(--space-4);
    border: 0;
    border-radius: var(--radius-pill);
    font-weight: 600;
    font-size: var(--text-sm);
    line-height: 1.2;
    text-decoration: none;
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
    touch-action: manipulation;
    transition-property: scale, background-color, color, box-shadow;
    transition-duration: 150ms;
    transition-timing-function: var(--ease);
  }
  .btn:active:not(:disabled) {
    scale: 0.96;
  }
  .lg {
    min-height: 3.25rem;
    padding: 0 var(--space-5);
    font-size: var(--text-md);
  }
  .full {
    width: 100%;
  }
  .primary {
    background: var(--indigo);
    color: var(--on-indigo);
  }
  .secondary {
    background: var(--surface);
    color: var(--ink);
    box-shadow: inset 0 0 0 1px var(--line-strong);
  }
  .ghost {
    background: transparent;
    color: var(--indigo);
  }
  .danger {
    background: var(--surface);
    color: var(--osun);
    box-shadow: inset 0 0 0 1px var(--osun);
  }
  @media (hover: hover) {
    .primary:hover:not(:disabled) {
      background: var(--indigo-hover);
    }
    .secondary:hover:not(:disabled),
    .ghost:hover:not(:disabled) {
      background: var(--indigo-soft);
    }
    .danger:hover:not(:disabled) {
      background: var(--osun-soft);
    }
  }
  .btn:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
  .busy:disabled {
    opacity: 0.85;
    cursor: progress;
  }
  .spinner {
    width: 1em;
    height: 1em;
    border-radius: 50%;
    border: 2px solid currentColor;
    border-right-color: transparent;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin {
    to {
      rotate: 1turn;
    }
  }
</style>
