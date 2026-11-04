<!--
  Dev-only design preview: real components with sample data, for reviewing
  layout without a wallet or a deployment. Not reachable in production builds.
-->
<script lang="ts">
  import { itemHash, type Request } from "@ipin/shared"
  import type { Address } from "viem"

  import type { Credit } from "#/chain/credit"
  import type { PotView } from "#/chain/vault"
  import { parseUsdInput } from "#/money/format"
  import type { SplitPlan } from "#/money/split"
  import RequestCard from "#/sender/RequestCard.svelte"
  import Amount from "#/ui/Amount.svelte"
  import Button from "#/ui/Button.svelte"
  import Notice from "#/ui/Notice.svelte"
  import PotCard from "#/ui/PotCard.svelte"
  import SplitEditor from "#/ui/SplitEditor.svelte"
  import StatusPill from "#/ui/StatusPill.svelte"

  const dev = import.meta.env.DEV
  const m = (s: string) => {
    const r = parseUsdInput(s)
    return r.ok ? r.value : 0n
  }
  const owner = "0x1111111111111111111111111111111111111111" as Address
  const vendor = "0x2222222222222222222222222222222222222222" as Address
  const bos = "0x3333333333333333333333333333333333333333" as Address
  const E18 = 10n ** 18n
  const trove = {
    debt: 2_002n * E18,
    price: 79_312n * E18,
    maxBorrowingCapacity: 10n ** 24n,
    borrowingRate: E18 / 1000n,
  }
  const healthyCredit: Credit = {
    status: "active",
    bos,
    nonce: 0n,
    line: { ...trove, coll: 10n ** 17n },
  }
  const thinCredit: Credit = {
    status: "active",
    bos,
    nonce: 0n,
    line: { ...trove, coll: 34n * 10n ** 15n },
  }

  const pots: PotView[] = [
    {
      id: 1n,
      name: "House",
      owner,
      createdAt: 0n,
      balance: m("2.25"),
      cap: m("7.50"),
      spent: m("5"),
      remaining: m("2.50"),
    },
    {
      id: 2n,
      name: "Upkeep",
      owner,
      createdAt: 0n,
      balance: m("1.50"),
      cap: m("2.50"),
      spent: m("1"),
      remaining: m("1.50"),
    },
  ]

  const request: Request = {
    id: "r1",
    potId: 1n,
    payee: vendor,
    item: "Cement bag 50kg",
    quantity: 5n,
    unitPrice: m("1"),
    amount: m("5"),
    vendor: "Vendor Y",
    note: "For the foundation, second row",
    requester: "0x3333333333333333333333333333333333333333" as Address,
    itemHash: itemHash("Cement bag 50kg", 5n, m("1"), "Vendor Y"),
    status: "pending",
    createdAt: new Date().toISOString(),
  }
  // Within the limit but more than the pot holds: the BTC-loan case.
  const loanRequest: Request = {
    ...request,
    id: "r2",
    item: "Sand, 1 trip",
    quantity: 2n,
    amount: m("2"),
    itemHash: itemHash("Sand, 1 trip", 2n, m("1"), "Vendor Y"),
    note: "",
  }

  let total = $state("10.00")
  let pieces = $state(["7.50", ""])
  let restIndex = $state(1)
  let split = $state<{ total: bigint; plan: SplitPlan } | null>(null)
</script>

{#if dev}
  <div class="wrap">
    <h1>Preview</h1>
    <div class="row"><Amount value={m("3.75")} size="xl" naira /></div>
    <div class="grid">
      {#each pots as pot (pot.id)}<PotCard {pot} />{/each}
    </div>
    <div class="card">
      <SplitEditor
        names={["House", "Upkeep"]}
        bind:total
        bind:pieces
        bind:restIndex
        bind:result={split}
        balance={m("50")}
      />
    </div>
    <RequestCard
      request={loanRequest}
      pot={{ ...pots[0]!, balance: m("0.50") }}
      payees={[vendor]}
      fee={m("0.25")}
      credit={healthyCredit}
      onchange={() => {}}
    />
    <RequestCard
      request={loanRequest}
      pot={{ ...pots[0]!, balance: m("0.50") }}
      payees={[vendor]}
      fee={m("0.25")}
      credit={thinCredit}
      onchange={() => {}}
    />
    <div class="row">
      {#each ["pending", "approved", "executed", "rejected", "failed"] as const as s (s)}<StatusPill
          status={s}
        />{/each}
    </div>
    <Notice tone="success" title="Paid">Vendor Y received $5.00.</Notice>
    <Notice tone="error" title="That step didn't go through"
      >You cancelled in your wallet. Nothing was sent.</Notice
    >
    <div class="row">
      <Button>Primary</Button><Button variant="secondary">Secondary</Button
      ><Button variant="danger">Decline</Button><Button busy>Busy</Button>
    </div>
  </div>
{:else}
  <p>Not available.</p>
{/if}

<style>
  .wrap {
    max-width: 40rem;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }
  .grid {
    display: grid;
    gap: var(--space-4);
  }
  .row {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }
</style>
