<!--
  One itemized request. Before the sender signs, the app recomputes the item
  hash and the total from the fields on screen, so what they read is exactly
  what the signature covers (R8).
-->
<script lang="ts">
  import {
    itemHash,
    paymentRequestDomain,
    paymentRequestTypedData,
    randomNonce,
    rejectMessage,
    type Request,
  } from "@ipin/shared"
  import type { Address, Hex } from "viem"

  import { relayer, RelayerError } from "#/api/relayer"
  import { explorer, publicClient } from "#/chain/client"
  import { requireDeployments } from "#/chain/deployment"
  import { isNonceUsed, type PotView, vaultWrites } from "#/chain/vault"
  import { wallet } from "#/chain/wallet.svelte"
  import { formatUsd } from "#/money/format"
  import {
    forgetSignedApproval,
    payeeLabel,
    rememberSignedApproval,
    type SignedApproval,
    signedApproval,
  } from "#/storage"
  import { formatWhen, nowSeconds, shortAddress } from "#/text"
  import Button from "#/ui/Button.svelte"
  import { Flow } from "#/ui/flow.svelte"
  import Notice from "#/ui/Notice.svelte"
  import StatusPill from "#/ui/StatusPill.svelte"
  import Steps from "#/ui/Steps.svelte"

  import { approvalExpiry } from "./approval"

  let {
    request,
    pot,
    payees,
    fee,
    onchange,
  }: {
    request: Request
    pot: PotView | undefined
    payees: Address[]
    fee: bigint | null
    onchange: () => void
  } = $props()

  const flow = new Flow()
  let paidTx = $state<Hex | null>(null)
  // An approval signed here but not (yet) settled; cancellable on-chain (M-01).
  let stored = $state<SignedApproval | undefined>(undefined)
  // The nonce turned out spent: paid or cancelled elsewhere. Not an error.
  let spentElsewhere = $state(false)

  $effect(() => {
    const saved = signedApproval(request.id)
    if (request.status === "executed" && saved) {
      forgetSignedApproval(request.id)
      stored = undefined
    } else {
      stored = saved
    }
  })

  const computedHash = $derived(
    itemHash(request.item, request.quantity, request.unitPrice, request.vendor),
  )
  const intact = $derived(
    computedHash.toLowerCase() === request.itemHash.toLowerCase() &&
      request.amount === request.quantity * request.unitPrice,
  )
  const payeeOk = $derived(
    payees.some((p) => p.toLowerCase() === request.payee.toLowerCase()),
  )
  const overCap = $derived(!!pot && request.amount > pot.remaining)
  const short = $derived(
    !!pot && fee !== null && request.amount + fee > pot.balance,
  )
  const canApprove = $derived(
    request.status === "pending" && intact && payeeOk && !!pot,
  )

  async function approve() {
    if (!canApprove) return
    const { chainId, vault } = requireDeployments()
    const message = {
      potId: request.potId,
      payee: request.payee,
      amount: request.amount,
      itemHash: request.itemHash,
      nonce: randomNonce(),
      expiry: approvalExpiry(nowSeconds()), // at most 7 days (L-02)
    }
    let signature: Hex | null = null
    const ok = await flow.run([
      {
        label: "Sign your approval",
        hint: "MetaMask shows the pot, payee and amount. Check them and sign.",
        run: async () => {
          const client = wallet.client()
          signature = await client.signTypedData({
            account: client.account.address,
            ...paymentRequestTypedData(
              paymentRequestDomain(chainId, vault),
              message,
            ),
          })
          const record = {
            requestId: request.id,
            nonce: message.nonce.toString(),
            expiry: message.expiry.toString(),
          }
          rememberSignedApproval(record)
          stored = record
        },
      },
      {
        label: `Pay ${request.vendor} ${formatUsd(request.amount)}`,
        hint: "The relayer sends it on Mezo and pays the gas",
        run: async () => {
          if (!signature) throw new Error("No signature.")
          try {
            const { txHash } = await relayer.approve(
              request.id,
              message,
              signature,
            )
            await publicClient.waitForTransactionReceipt({ hash: txHash })
            paidTx = txHash
            forgetSignedApproval(request.id)
            stored = undefined
            return txHash
          } catch (err) {
            if (err instanceof RelayerError && err.nonceUsed) {
              spentElsewhere = true
              forgetSignedApproval(request.id)
              stored = undefined
              return null
            }
            throw err
          }
        },
      },
    ])
    if (ok) onchange()
  }

  async function reject() {
    const ok = await flow.run([
      {
        label: "Sign to decline",
        hint: "Confirm in MetaMask. No money moves.",
        run: async () => {
          const client = wallet.client()
          const sig = await client.signMessage({
            account: client.account.address,
            message: rejectMessage(request.id),
          })
          await relayer.reject(request.id, sig)
        },
      },
    ])
    if (ok) onchange()
  }

  /** Kill a signed approval the relayer never submitted (invalidateNonce). */
  async function cancelApproval() {
    const approval = stored
    if (!approval) return
    const ok = await flow.run([
      {
        label: "Cancel your signed approval",
        hint: "Confirm in MetaMask. This makes the signature useless.",
        run: async () => {
          try {
            return await vaultWrites.invalidateNonce(BigInt(approval.nonce))
          } catch (err) {
            if (isNonceUsed(err)) {
              spentElsewhere = true
              return null
            }
            throw err
          }
        },
      },
    ])
    if (ok) {
      forgetSignedApproval(request.id)
      stored = undefined
      onchange()
    }
  }

  const txHash = $derived(paidTx ?? request.txHash ?? null)
  const canCancel = $derived(
    !!stored && !paidTx && !spentElsewhere && request.status !== "executed",
  )
</script>

<article class="req" class:pending={request.status === "pending"}>
  <header>
    <span class="pot">{pot?.name ?? `Pot #${request.potId}`}</span>
    <StatusPill status={paidTx ? "executed" : request.status} />
  </header>

  <h3>{request.item}</h3>

  <div
    class="maths num"
    aria-label="{request.quantity} at {formatUsd(
      request.unitPrice,
    )} each, total {formatUsd(request.amount)}"
  >
    <span class="q">{request.quantity.toString()}</span>
    <span class="op" aria-hidden="true">×</span>
    <span class="u">{formatUsd(request.unitPrice)}</span>
    <span class="op" aria-hidden="true">=</span>
    <span class="t">{formatUsd(request.amount)}</span>
  </div>

  <dl>
    <div>
      <dt>Vendor</dt>
      <dd>{request.vendor}</dd>
    </div>
    <div>
      <dt>Paid to</dt>
      <dd>
        {payeeLabel(request.payee) ?? "Approved payee"}
        <a
          class="mono addr"
          href={explorer.address(request.payee)}
          target="_blank"
          rel="noreferrer">{shortAddress(request.payee)}</a
        >
      </dd>
    </div>
    <div>
      <dt>Asked by</dt>
      <dd class="mono addr">{shortAddress(request.requester)}</dd>
    </div>
    <div>
      <dt>When</dt>
      <dd>{formatWhen(request.createdAt)}</dd>
    </div>
  </dl>

  {#if request.note}<p class="note">“{request.note}”</p>{/if}

  {#if request.status === "pending"}
    {#if !intact}
      <Notice tone="error" title="Don't approve this">
        The details don't match what would be signed. Ask for a new request.
      </Notice>
    {:else if !payeeOk}
      <Notice tone="error" title="Not an approved payee">
        This would pay an address that isn't on the pot's list. Add it as a
        payee first if you trust it.
      </Notice>
    {:else if overCap}
      <Notice tone="warn" title="Over this month's limit">
        Only {formatUsd(pot?.remaining ?? 0n)} is left this month. Approving will
        fail until the limit resets or you raise it.
      </Notice>
    {:else if short}
      <Notice tone="warn" title="Not enough in the pot">
        It needs {formatUsd(request.amount + (fee ?? 0n))} including the fee. Add
        money first.
      </Notice>
    {/if}
    {#if fee !== null}
      <p class="fee">
        Plus a {formatUsd(fee)} relayer fee from the same pot. The requester pays
        nothing.
      </p>
    {/if}
  {:else if request.status === "failed" && request.error}
    <Notice tone="error">{request.error}</Notice>
  {/if}

  <Steps {flow} />

  {#if spentElsewhere}
    <Notice tone="info" title="Already settled or cancelled">
      This approval was already used or cancelled, so nothing more can be paid
      with it. Check the statement for the payment.
    </Notice>
  {:else if canCancel && !flow.running}
    <Notice tone="warn" title="Your approval is signed but not paid">
      If the relayer can't send it, cancel it so the signature can never be
      used. It also expires on its own within the hour.
    </Notice>
    <Button variant="danger" onclick={cancelApproval}>Cancel approval</Button>
  {/if}

  {#if txHash}
    <a class="tx" href={explorer.tx(txHash)} target="_blank" rel="noreferrer"
      >See the payment on Mezo explorer</a
    >
  {/if}

  {#if request.status === "pending" && !paidTx && !flow.done && !stored && !spentElsewhere}
    <div class="actions">
      <Button variant="danger" onclick={reject} disabled={flow.running}
        >Decline</Button
      >
      <Button
        size="lg"
        onclick={approve}
        busy={flow.running}
        disabled={!canApprove}
      >
        Approve {formatUsd(request.amount)}
      </Button>
    </div>
  {/if}
</article>

<style>
  .req {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-5);
    border-radius: var(--radius-lg);
    background: var(--surface);
    box-shadow: var(--shadow-1);
  }
  .req.pending {
    box-shadow: var(--shadow-2);
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-2);
  }
  .pot {
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--ink-3);
  }
  h3 {
    font-size: var(--text-xl);
  }
  .maths {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 0.4rem;
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    background: var(--surface-2);
    font-size: var(--text-md);
  }
  .op {
    color: var(--ink-3);
  }
  .q,
  .u {
    font-weight: 600;
  }
  .t {
    margin-left: auto;
    font-family: var(--font-display);
    font-size: var(--text-xl);
    line-height: 1;
  }
  dl {
    margin: 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
  }
  dl div {
    min-width: 0;
  }
  dt {
    font-size: var(--text-xs);
    color: var(--ink-3);
  }
  dd {
    margin: 0;
    font-weight: 600;
    font-size: var(--text-sm);
    display: flex;
    flex-direction: column;
    overflow-wrap: anywhere;
  }
  .addr {
    font-weight: 400;
    font-size: var(--text-xs);
    color: var(--ink-2);
    width: fit-content;
  }
  .note {
    font-size: var(--text-sm);
    color: var(--ink-2);
    font-style: italic;
  }
  .fee {
    font-size: var(--text-xs);
    color: var(--ink-3);
  }
  .tx {
    display: inline-flex;
    align-items: center;
    min-height: var(--tap);
    font-weight: 600;
    font-size: var(--text-sm);
  }
  .actions {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--space-2);
    margin-top: var(--space-1);
  }
</style>
