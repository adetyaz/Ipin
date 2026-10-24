<!-- Approved payees (I5): the only addresses money can leave this pot to. -->
<script lang="ts">
  import { type Address, getAddress, isAddress } from "viem"

  import { explorer } from "#/chain/client"
  import { vaultWrites } from "#/chain/vault"
  import { payeeLabel, setPayeeLabel } from "#/storage"
  import { shortAddress } from "#/text"
  import Button from "#/ui/Button.svelte"
  import { Flow } from "#/ui/flow.svelte"
  import Notice from "#/ui/Notice.svelte"
  import Steps from "#/ui/Steps.svelte"

  let {
    potId,
    payees,
    requesters,
    onchange,
  }: {
    potId: bigint
    payees: Address[] | null
    requesters: Address[]
    onchange: () => void
  } = $props()

  let name = $state("")
  let address = $state("")
  let adding = $state(false)
  let removing = $state<Address | null>(null)
  const flow = new Flow()

  const addressError = $derived.by(() => {
    const a = address.trim()
    if (a === "") return null
    if (!isAddress(a, { strict: false }))
      return "That doesn't look like a wallet address (0x…, 42 characters)."
    const c = getAddress(a)
    if (payees?.some((p) => p.toLowerCase() === c.toLowerCase()))
      return "Already approved."
    if (requesters.some((r) => r.toLowerCase() === c.toLowerCase())) {
      return "This person asks for money on this pot, so they can't be paid from it."
    }
    return null
  })

  async function add() {
    const a = address.trim()
    if (!isAddress(a, { strict: false }) || addressError) return
    const payee = getAddress(a)
    const ok = await flow.run([
      {
        label: `Approve ${name.trim() || shortAddress(payee)} as a payee`,
        hint: "Confirm in MetaMask",
        run: () => vaultWrites.addPayee(potId, payee),
      },
    ])
    if (ok) {
      if (name.trim()) setPayeeLabel(payee, name)
      name = ""
      address = ""
      adding = false
      onchange()
    }
  }

  async function remove(p: Address) {
    removing = p
    const ok = await flow.run([
      {
        label: `Remove ${payeeLabel(p) ?? shortAddress(p)}`,
        hint: "Confirm in MetaMask",
        run: () => vaultWrites.removePayee(potId, p),
      },
    ])
    removing = null
    if (ok) onchange()
  }
</script>

<section class="card sec" aria-labelledby="payees-h">
  <div class="head">
    <div>
      <h2 id="payees-h">Who can be paid</h2>
      <p class="muted sub">
        Vendors and family. Money goes straight to them, never through the
        requester.
      </p>
    </div>
  </div>

  {#if payees === null}
    <p class="muted">Loading…</p>
  {:else if payees.length === 0}
    <p class="empty">
      No payees yet. Add the cement vendor or builder you trust.
    </p>
  {:else}
    <ul class="list">
      {#each payees as p (p)}
        <li>
          <span class="avatar" aria-hidden="true"
            >{(payeeLabel(p) ?? "?").slice(0, 1).toUpperCase()}</span
          >
          <span class="who">
            <span class="label">{payeeLabel(p) ?? "Unnamed payee"}</span>
            <a
              class="mono addr"
              href={explorer.address(p)}
              target="_blank"
              rel="noreferrer">{shortAddress(p)}</a
            >
          </span>
          <Button
            variant="ghost"
            busy={removing === p}
            disabled={flow.running}
            onclick={() => remove(p)}
          >
            Remove
          </Button>
        </li>
      {/each}
    </ul>
  {/if}

  {#if adding}
    <form
      class="add"
      onsubmit={(e) => {
        e.preventDefault()
        void add()
      }}
    >
      <label class="f">
        <span>Name (only you see this)</span>
        <input
          bind:value={name}
          placeholder="Vendor Y, cement"
          maxlength="40"
        />
      </label>
      <label class="f">
        <span>Their MUSD wallet address</span>
        <input
          bind:value={address}
          placeholder="0x…"
          class="mono"
          autocomplete="off"
          spellcheck="false"
          aria-invalid={!!addressError}
          aria-describedby="payee-addr-err"
        />
      </label>
      {#if addressError}<p class="err" id="payee-addr-err">
          {addressError}
        </p>{/if}
      <div class="row">
        <Button
          variant="secondary"
          onclick={() => (adding = false)}
          disabled={flow.running}>Cancel</Button
        >
        <Button
          type="submit"
          busy={flow.running}
          disabled={!address.trim() || !!addressError}
        >
          Approve payee
        </Button>
      </div>
    </form>
  {:else}
    <Button variant="secondary" onclick={() => (adding = true)}
      >+ Add a payee</Button
    >
  {/if}

  <Steps {flow} />
  {#if flow.error}<Notice tone="error">{flow.error}</Notice>{/if}
</section>

<style>
  .sec {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
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
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }
  .list li {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) 0;
  }
  .list li + li {
    border-top: 1px solid var(--line);
  }
  .avatar {
    flex: none;
    display: grid;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 50%;
    background: var(--indigo-soft);
    color: var(--indigo);
    font-weight: 700;
  }
  .who {
    display: flex;
    flex-direction: column;
    min-width: 0;
    margin-right: auto;
  }
  .label {
    font-weight: 600;
  }
  .addr {
    font-size: var(--text-xs);
    color: var(--ink-2);
    width: fit-content;
  }
  .add {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4);
    border-radius: var(--radius-md);
    background: var(--surface-2);
  }
  .f {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .f span {
    font-size: var(--text-sm);
    font-weight: 600;
  }
  .f input {
    min-height: 3rem;
    padding: 0 var(--space-3);
    border: 0;
    border-radius: var(--radius-md);
    background: var(--surface);
    box-shadow: inset 0 0 0 1px var(--line-strong);
    width: 100%;
  }
  .f input:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 2px var(--indigo);
  }
  .f input[aria-invalid="true"] {
    box-shadow: inset 0 0 0 2px var(--osun);
  }
  .err {
    font-size: var(--text-sm);
    color: var(--osun);
  }
  .row {
    display: flex;
    gap: var(--space-2);
    justify-content: flex-end;
  }
</style>
