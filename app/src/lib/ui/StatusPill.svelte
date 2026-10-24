<script lang="ts">
  import type { RequestStatus } from "@ipin/shared"

  import { STATUS_WORDS } from "#/api/relayer"

  let { status }: { status: RequestStatus } = $props()
</script>

<span class="pill {status}">
  <span class="dot" aria-hidden="true"></span>{STATUS_WORDS[status]}
</span>

<style>
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 0.4em;
    padding: 0.2rem 0.6rem;
    border-radius: var(--radius-pill);
    font-size: var(--text-xs);
    font-weight: 600;
    white-space: nowrap;
    background: var(--surface-2);
    color: var(--ink-2);
  }
  .dot {
    width: 0.45rem;
    height: 0.45rem;
    border-radius: 50%;
    background: currentColor;
  }
  .pending {
    background: var(--palm-soft);
    color: var(--palm-ink);
  }
  .approved {
    background: var(--indigo-soft);
    color: var(--indigo);
  }
  .executed {
    background: var(--leaf-soft);
    color: var(--leaf);
  }
  .rejected,
  .failed {
    background: var(--osun-soft);
    color: var(--osun);
  }
</style>
