<script lang="ts">
  import Button from "#/ui/Button.svelte"
  import Notice from "#/ui/Notice.svelte"
  import { page } from "$app/state"

  const notFound = $derived(page.status === 404)
</script>

<svelte:head><title>Something went wrong · Ìpín</title></svelte:head>

<div class="page">
  <h1>{notFound ? "This page doesn't exist" : "Something went wrong"}</h1>
  <Notice
    tone={notFound ? "info" : "error"}
    title={`Error ${String(page.status)}`}
  >
    {page.error?.message ?? "Unknown error"}
  </Notice>
  <p class="muted">
    {notFound
      ? "Check the link, or start from the home page."
      : "Reload the page. If it happens again, note what you tapped and the message above."}
  </p>
  <div class="actions">
    <Button onclick={() => location.reload()}>Reload</Button>
    <Button variant="secondary" href="/">Home</Button>
  </div>
</div>

<style>
  .page {
    max-width: 36rem;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  h1 {
    font-size: var(--text-2xl);
  }
  .actions {
    display: flex;
    gap: var(--space-3);
    flex-wrap: wrap;
  }
</style>
