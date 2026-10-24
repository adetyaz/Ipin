<script lang="ts">
  import { explorer } from "#/chain/client"

  import type { Flow } from "./flow.svelte"

  let { flow }: { flow: Flow } = $props()
</script>

{#if flow.steps.length > 0}
  <ol class="steps" aria-live="polite">
    {#each flow.steps as step, i (i)}
      <li class="step {step.status}">
        <span class="dot" aria-hidden="true">
          {#if step.status === "done" || step.status === "skipped"}
            <svg viewBox="0 0 20 20"><path d="M5 10.5l3 3 7-7" /></svg>
          {:else if step.status === "error"}
            <svg viewBox="0 0 20 20"
              ><path d="M6.5 6.5l7 7M13.5 6.5l-7 7" /></svg
            >
          {:else if step.status === "active"}
            <span class="pulse"></span>
          {:else}
            <span class="n">{i + 1}</span>
          {/if}
        </span>
        <div class="text">
          <p class="label">
            {step.label}
            <span class="visually-hidden">
              — {step.status === "active"
                ? "in progress"
                : step.status === "skipped"
                  ? "not needed"
                  : step.status}
            </span>
          </p>
          {#if step.status === "active" && step.hint}
            <p class="hint">{step.hint}</p>
          {/if}
          {#if step.status === "skipped"}
            <p class="hint">Already done</p>
          {/if}
          {#if step.error}
            <p class="err">{step.error}</p>
          {/if}
          {#if step.hash}
            <a
              class="hint"
              href={explorer.tx(step.hash)}
              target="_blank"
              rel="noreferrer">View on Mezo explorer</a
            >
          {/if}
        </div>
      </li>
    {/each}
  </ol>
{/if}

<style>
  .steps {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .step {
    display: flex;
    gap: var(--space-3);
    align-items: flex-start;
  }
  .dot {
    flex: none;
    display: grid;
    place-items: center;
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 50%;
    background: var(--surface-2);
    color: var(--ink-3);
    font-size: var(--text-xs);
    font-weight: 600;
    transition-property: background-color, color;
    transition-duration: 150ms;
  }
  .active .dot {
    background: var(--palm-soft);
  }
  .done .dot,
  .skipped .dot {
    background: var(--leaf);
    color: var(--surface);
  }
  .error .dot {
    background: var(--osun);
    color: var(--surface);
  }
  svg {
    width: 1rem;
    height: 1rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.4;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .pulse {
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 50%;
    background: var(--palm);
    animation: pulse 1.1s ease-in-out infinite;
  }
  @keyframes pulse {
    50% {
      opacity: 0.35;
      scale: 0.7;
    }
  }
  .text {
    padding-top: 0.15rem;
    min-width: 0;
  }
  .label {
    font-weight: 500;
  }
  .waiting .label {
    color: var(--ink-3);
  }
  .hint {
    display: block;
    font-size: var(--text-xs);
    color: var(--ink-2);
  }
  a.hint {
    color: var(--indigo);
    min-height: 1.5rem;
  }
  .err {
    font-size: var(--text-sm);
    color: var(--osun);
  }
</style>
