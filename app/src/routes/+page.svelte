<script lang="ts">
  import { joinedPots } from "#/storage"
  import AdireSwatch from "#/ui/AdireSwatch.svelte"
  import Button from "#/ui/Button.svelte"

  const joined = joinedPots()
</script>

<svelte:head>
  <title>Ìpín · You decide what your money is for</title>
</svelte:head>

<section class="hero">
  <div class="copy">
    <p class="eyebrow">Ìpín · Yoruba for “share”</p>
    <h1>You decide what your money is for, not whoever receives it.</h1>
    <p class="lede">
      Send money home in pots: one for the house, one for upkeep. Family asks
      for what they need, you approve it from your phone, and the vendor is paid
      directly. Every cent shows up on the statement.
    </p>
  </div>

  <figure
    class="cloth"
    aria-label="Example: $10.00 sent home, split into House $7.50 and Upkeep $2.50"
  >
    <figcaption>
      <span class="eyebrow">Sent home</span>
      <span class="total">$10.00</span>
    </figcaption>
    <div class="strip">
      <div class="piece house">
        <AdireSwatch seed="House" />
        <span class="tag"><span>House</span><span class="num">$7.50</span></span
        >
      </div>
      <div class="piece upkeep">
        <AdireSwatch seed="Upkeep" />
        <span class="tag"
          ><span>Upkeep</span><span class="num">$2.50</span></span
        >
      </div>
    </div>
    <p class="note">
      Pieces always add up to the deposit. Any remainder goes to the pot you
      name.
    </p>
  </figure>
</section>

<section class="roles" aria-label="Choose how you use Ìpín">
  <a class="role send" href="/send">
    <span class="eyebrow">I'm sending money</span>
    <span class="title">Set up pots and approve requests</span>
    <span class="desc muted"
      >Uses MetaMask on Mezo testnet. You sign; you never pay the vendor by
      hand.</span
    >
    <span class="go" aria-hidden="true">Open sender</span>
  </a>

  {#if joined.length > 0}
    <a class="role ask" href="/ask">
      <span class="eyebrow">I've been invited</span>
      <span class="title">Ask for what the house needs</span>
      <span class="desc muted">
        You're part of {joined.length === 1 ? "1 pot" : `${joined.length} pots`} on
        this phone. No wallet, no fees.
      </span>
      <span class="go" aria-hidden="true">Open my requests</span>
    </a>
  {:else}
    <div class="role ask static">
      <span class="eyebrow">I've been invited</span>
      <span class="title">Open the link the sender shared</span>
      <span class="desc muted">
        Invites arrive on WhatsApp. Tap the link and you can ask for money right
        away. No wallet, no app to install, no fees.
      </span>
    </div>
  {/if}
</section>

<section class="how" aria-labelledby="how">
  <h2 id="how">How a payment happens</h2>
  <ol>
    <li>
      <span class="n" aria-hidden="true">1</span>
      <p>
        <strong>The site manager asks.</strong> “5 bags of cement, $1.00 each, Vendor
        Y.”
      </p>
    </li>
    <li>
      <span class="n" aria-hidden="true">2</span>
      <p>
        <strong>You check and approve.</strong> One signature from your phone.
      </p>
    </li>
    <li>
      <span class="n" aria-hidden="true">3</span>
      <p>
        <strong>Vendor Y is paid directly.</strong> Within the pot's monthly limit,
        never through the requester.
      </p>
    </li>
  </ol>
  <div class="cta">
    <Button href="/send" size="lg">Start as a sender</Button>
  </div>
  <p class="fine muted">
    Runs on Mezo testnet with MUSD, a Bitcoin-backed dollar. Amounts are test
    money.
  </p>
</section>

<style>
  .hero {
    display: grid;
    gap: var(--space-6);
    padding: var(--space-5) 0 var(--space-6);
  }
  @media (min-width: 900px) {
    .hero {
      grid-template-columns: 1.15fr 1fr;
      align-items: center;
      gap: var(--space-7);
      padding: var(--space-7) 0;
    }
  }
  .copy {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  h1 {
    font-size: clamp(2.25rem, 9vw, 3.75rem);
    line-height: 1.05;
    letter-spacing: -0.02em;
    max-width: 16ch;
  }
  .lede {
    font-size: var(--text-md);
    color: var(--ink-2);
    max-width: 38ch;
  }

  .cloth {
    margin: 0;
    padding: var(--space-5);
    background: var(--surface);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-2);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  figcaption {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .total {
    font-family: var(--font-display);
    font-size: var(--text-xl);
  }
  .strip {
    display: grid;
    grid-template-columns: 3fr 1fr;
    gap: 0.375rem;
    height: 11rem;
  }
  .piece {
    position: relative;
    border-radius: var(--radius-sm);
    overflow: hidden;
  }
  .piece:first-child {
    border-radius: var(--radius-md) var(--radius-sm) var(--radius-sm)
      var(--radius-md);
  }
  .piece:last-child {
    border-radius: var(--radius-sm) var(--radius-md) var(--radius-md)
      var(--radius-sm);
  }
  .tag {
    position: absolute;
    left: var(--space-2);
    bottom: var(--space-2);
    right: var(--space-2);
    display: flex;
    flex-direction: column;
    padding: 0.35rem 0.6rem;
    border-radius: 0.375rem;
    background: var(--surface);
    font-size: var(--text-xs);
    font-weight: 600;
    line-height: 1.3;
    width: fit-content;
  }
  .tag .num {
    font-family: var(--font-display);
    font-weight: 400;
    font-size: var(--text-md);
  }
  .note {
    font-size: var(--text-xs);
    color: var(--ink-3);
  }

  .roles {
    display: grid;
    gap: var(--space-4);
  }
  @media (min-width: 720px) {
    .roles {
      grid-template-columns: 1fr 1fr;
    }
  }
  .role {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-5);
    border-radius: var(--radius-lg);
    background: var(--surface);
    box-shadow: var(--shadow-1);
    color: inherit;
    text-decoration: none;
    transition-property: box-shadow, scale;
    transition-duration: 150ms;
    transition-timing-function: var(--ease);
  }
  a.role:active {
    scale: 0.985;
  }
  @media (hover: hover) {
    a.role:hover {
      box-shadow: var(--shadow-2);
    }
  }
  .role.send {
    background: var(--cloth);
    color: #fff;
  }
  .role.send .eyebrow {
    color: var(--palm);
  }
  .role.send .desc {
    color: #d3daf3;
  }
  .role.static {
    background: transparent;
    box-shadow: inset 0 0 0 1px var(--line-strong);
  }
  .title {
    font-family: var(--font-display);
    font-size: var(--text-xl);
    line-height: 1.15;
  }
  .desc {
    font-size: var(--text-sm);
  }
  .go {
    margin-top: var(--space-2);
    font-weight: 600;
    font-size: var(--text-sm);
  }
  .go::after {
    content: " →";
  }

  .how {
    margin-top: var(--space-7);
    max-width: 40rem;
  }
  .how h2 {
    font-size: var(--text-xl);
    margin-bottom: var(--space-4);
  }
  ol {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  li {
    display: flex;
    gap: var(--space-3);
    align-items: flex-start;
  }
  .n {
    flex: none;
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    background: var(--palm-soft);
    color: var(--palm-ink);
    font-weight: 700;
    font-size: var(--text-sm);
  }
  li p {
    padding-top: 0.2rem;
  }
  .cta {
    margin-top: var(--space-5);
  }
  .fine {
    margin-top: var(--space-4);
    font-size: var(--text-xs);
  }
</style>
