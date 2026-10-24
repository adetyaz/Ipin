<!--
  A strip of àdìrẹ cloth, drawn per pot. The motif comes from the pot's name,
  so "House" always wears the same cloth on every screen. Decorative only.
-->
<script lang="ts">
  let { seed, class: className = "" }: { seed: string; class?: string } =
    $props()

  const uid = $props.id()

  function hash(s: string): number {
    let h = 2166136261
    for (const ch of s) {
      h ^= ch.codePointAt(0) ?? 0
      // FNV-1a multiply by 16777619, as shift-adds so it stays exact in 32 bits.
      h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0
    }
    return h
  }

  const h = $derived(hash(seed.toLowerCase()))
  const motif = $derived(h % 5)
  const tilt = $derived([0, 45, 0, 90, 0][(h >>> 3) % 5] ?? 0)
</script>

<!-- No viewBox: the 24px tile stays the same size on every element, like cloth. -->
<svg class="swatch {className}" aria-hidden="true" focusable="false">
  <defs>
    <pattern
      id="p-{uid}"
      width="24"
      height="24"
      patternUnits="userSpaceOnUse"
      patternTransform="rotate({tilt})"
    >
      {#if motif === 0}
        <!-- Oníkò: tied circles -->
        <circle
          cx="12"
          cy="12"
          r="8.5"
          class="m1"
          fill="none"
          stroke-width="1.6"
        />
        <circle
          cx="12"
          cy="12"
          r="4.5"
          class="m2"
          fill="none"
          stroke-width="1.4"
        />
        <circle cx="12" cy="12" r="1.4" class="f1" />
      {:else if motif === 1}
        <!-- Ẹlẹ́kọ: starch-resist bands and dots -->
        <rect x="0" y="3" width="24" height="3" class="f2" />
        <rect x="0" y="18" width="24" height="1.5" class="f1" />
        <circle cx="6" cy="12" r="1.8" class="f1" />
        <circle cx="18" cy="12" r="1.8" class="f1" />
      {:else if motif === 2}
        <!-- Zigzag rows -->
        <polyline
          points="0,8 6,3 12,8 18,3 24,8"
          class="m1"
          fill="none"
          stroke-width="1.6"
        />
        <polyline
          points="0,19 6,14 12,19 18,14 24,19"
          class="m2"
          fill="none"
          stroke-width="1.4"
        />
      {:else if motif === 3}
        <!-- Crossed stitches and seeds -->
        <path d="M5 5 L11 11 M11 5 L5 11" class="m1" stroke-width="1.6" />
        <path d="M13 13 L19 19 M19 13 L13 19" class="m2" stroke-width="1.4" />
        <circle cx="18" cy="6" r="1.4" class="f1" />
        <circle cx="6" cy="18" r="1.4" class="f2" />
      {:else}
        <!-- Diamond lattice -->
        <path
          d="M12 1 L23 12 L12 23 L1 12 Z"
          class="m1"
          fill="none"
          stroke-width="1.5"
        />
        <path d="M12 7 L17 12 L12 17 L7 12 Z" class="f2" />
      {/if}
    </pattern>
  </defs>
  <rect width="100%" height="100%" class="field" />
  <rect width="100%" height="100%" fill="url(#p-{uid})" />
</svg>

<style>
  .swatch {
    display: block;
    width: 100%;
    height: 100%;
  }
  .field {
    fill: var(--cloth);
  }
  .m1 {
    stroke: var(--cloth-mark);
  }
  .m2 {
    stroke: var(--cloth-mark-2);
  }
  .f1 {
    fill: var(--cloth-mark);
  }
  .f2 {
    fill: var(--cloth-mark-2);
  }
</style>
