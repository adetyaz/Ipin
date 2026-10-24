<!--
  The invite link opened on the requester's phone. A key is made silently in
  the browser (ADR-012); accepting signs "Ipin invite <code>" with it.
-->
<script lang="ts">
  import { relayer, relayerUrl } from "#/api/relayer"
  import { deployment } from "#/chain/deployment"
  import { readPot } from "#/chain/vault"
  import { requesterAccount, signInviteClaim } from "#/requester/key"
  import { decodePayeeNames, rememberJoined } from "#/storage"
  import AdireSwatch from "#/ui/AdireSwatch.svelte"
  import Button from "#/ui/Button.svelte"
  import Notice from "#/ui/Notice.svelte"
  import { goto } from "$app/navigation"
  import { page } from "$app/state"

  const code = $derived(page.params.code ?? "")
  const me = requesterAccount().address

  type State =
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | { kind: "open"; potId: bigint; label: string }
    | { kind: "taken" }

  let view = $state<State>({ kind: "loading" })
  let potName = $state<string | null>(null)
  let accepting = $state(false)
  let acceptError = $state<string | null>(null)

  function join(potId: bigint, label: string) {
    rememberJoined({
      code,
      potId: potId.toString(),
      label,
      joinedAt: new Date().toISOString(),
      payeeNames: decodePayeeNames(page.url.hash),
      ...(potName ? { potName } : {}),
    })
    void goto(`/ask/${encodeURIComponent(code)}`, { replaceState: true })
  }

  $effect(() => {
    if (!relayerUrl) {
      view = {
        kind: "error",
        message:
          "This copy of Ìpín isn't connected to its relayer yet, so invites can't open.",
      }
      return
    }
    relayer
      .getInvite(code)
      .then((inv) => {
        if (inv.claimedBy && inv.claimedBy.toLowerCase() === me.toLowerCase()) {
          join(inv.potId, inv.label)
        } else if (inv.claimedBy) {
          view = { kind: "taken" }
        } else {
          view = { kind: "open", potId: inv.potId, label: inv.label }
          if (deployment.status === "deployed") {
            readPot(inv.potId)
              .then((p) => (potName = p?.name ?? null))
              .catch(() => undefined)
          }
        }
      })
      .catch((err: unknown) => {
        view = {
          kind: "error",
          message:
            err instanceof Error && "code" in err && err.code === "NOT_FOUND"
              ? "This invite link doesn't exist. Check you copied all of it, or ask for a new one."
              : err instanceof Error
                ? err.message
                : "Couldn't open the invite.",
        }
      })
  })

  async function accept() {
    if (view.kind !== "open") return
    accepting = true
    acceptError = null
    try {
      const signature = await signInviteClaim(code)
      await relayer.claimInvite(code, me, signature)
      join(view.potId, view.label)
    } catch (err) {
      acceptError =
        err instanceof Error ? err.message : "Couldn't accept the invite."
      accepting = false
    }
  }
</script>

<svelte:head><title>You're invited · Ìpín</title></svelte:head>

<div class="page">
  {#if view.kind === "loading"}
    <div class="card"><p class="muted">Opening your invite…</p></div>
  {:else if view.kind === "error"}
    <div class="card stack">
      <h1>That didn't open</h1>
      <Notice tone="error">{view.message}</Notice>
    </div>
  {:else if view.kind === "taken"}
    <div class="card stack">
      <h1>This invite was already used</h1>
      <p class="muted">
        Someone accepted it on another phone. If that wasn't you, ask the sender
        for a new link.
      </p>
    </div>
  {:else}
    <div class="invite">
      <div class="cloth"><AdireSwatch seed={potName ?? "House"} /></div>
      <div class="body">
        <p class="eyebrow">You're invited as {view.label}</p>
        <h1>Ask for what the {potName ?? "pot"} needs</h1>
        <ul class="points">
          <li>Send a request: the item, how many, the price and the vendor.</li>
          <li>The sender approves it from their phone.</li>
          <li>
            The vendor is paid directly. You pay no fees and need no wallet.
          </li>
        </ul>
        {#if acceptError}<Notice tone="error">{acceptError}</Notice>{/if}
        <Button size="lg" full busy={accepting} onclick={accept}>
          {accepting ? "Accepting…" : "Accept invite"}
        </Button>
        <p class="fine">
          This phone keeps a private key for Ìpín. It can only send requests,
          never move money. Use the same phone and browser next time.
        </p>
      </div>
    </div>
  {/if}
</div>

<style>
  .page {
    max-width: var(--content);
    margin: var(--space-4) auto 0;
  }
  h1 {
    font-size: var(--text-2xl);
  }
  .invite {
    border-radius: var(--radius-lg);
    background: var(--surface);
    box-shadow: var(--shadow-2);
    overflow: hidden;
  }
  .cloth {
    height: 6rem;
  }
  .body {
    padding: var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .points {
    margin: 0;
    padding-left: 1.2rem;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    color: var(--ink-2);
  }
  .points li::marker {
    color: var(--palm);
  }
  .fine {
    font-size: var(--text-xs);
    color: var(--ink-3);
  }
</style>
