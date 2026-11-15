/**
 * Purpose templates (docs/wave2.md 1): presets for the existing create-pots
 * flow. No new contract code: a template only fills in pot names, monthly
 * limits and the split. Amounts are at testnet scale, as decimal strings the
 * form parses (never floats).
 */
export interface Template {
  id: string
  title: string
  /** One line: who it's for. */
  blurb: string
  pots: { name: string; cap: string }[]
  /** Add money now? Pay-at-checkout starts empty: it borrows. */
  addMoney: boolean
  total: string
  /** Fixed amounts per pot; the rest pot's entry is "". */
  pieces: string[]
  restIndex: number
  /** What to do after creating the pots. */
  next: string
}

export const TEMPLATES: readonly Template[] = [
  {
    id: "house",
    title: "Build a house",
    blurb: "A site manager asks for materials; you approve each one.",
    pots: [
      { name: "House", cap: "7.50" },
      { name: "Upkeep", cap: "2.50" },
    ],
    addMoney: true,
    total: "10.00",
    pieces: ["7.50", ""],
    restIndex: 1,
    next: "Add your vendors as payees, invite the site manager, and set a monthly allowance from Upkeep.",
  },
  {
    id: "school",
    title: "School fees",
    blurb: "Fees go straight to the school; books on request.",
    pots: [
      { name: "Fees", cap: "6.00" },
      { name: "Books", cap: "2.00" },
    ],
    addMoney: true,
    total: "8.00",
    pieces: ["6.00", ""],
    restIndex: 1,
    next: "Add the school's account as a payee of Fees and schedule the fee; invite your child or their guardian to ask for books.",
  },
  {
    id: "medical",
    title: "Medical care",
    blurb: "A low limit, paid only to the hospital or pharmacy.",
    pots: [{ name: "Care", cap: "3.00" }],
    addMoney: true,
    total: "5.00",
    pieces: [""],
    restIndex: 0,
    next: "Add the hospital and pharmacy as payees, then invite the relative who'll ask.",
  },
  {
    id: "stock",
    title: "Shop stock",
    blurb: "A shop owner restocks from suppliers you approve.",
    pots: [{ name: "Stock", cap: "5.00" }],
    addMoney: true,
    total: "5.00",
    pieces: [""],
    restIndex: 0,
    next: "Add the suppliers as payees and invite the shop owner.",
  },
  {
    id: "subscriptions",
    title: "Subscriptions",
    blurb: "Gym, internet, a service: paid automatically.",
    pots: [{ name: "Subs", cap: "3.00" }],
    addMoney: true,
    total: "3.00",
    pieces: [""],
    restIndex: 0,
    next: "Open a merchant's subscribe link, or ask them to make one at /merchant.",
  },
  {
    id: "agent",
    title: "AI agent budget",
    blurb: "A weekly float an agent spends on paid APIs (x402).",
    pots: [{ name: "Agent", cap: "2.50" }],
    addMoney: true,
    total: "5.00",
    pieces: [""],
    restIndex: 0,
    next: "On the Agent pot's page, give your agent a weekly budget: it gets a small float, never the pot.",
  },
  {
    id: "checkout",
    title: "Pay with BTC",
    blurb: "Keep your BTC; pay vendors with MUSD borrowed against it.",
    pots: [{ name: "Credit", cap: "5.00" }],
    addMoney: false,
    total: "0.00",
    pieces: [""],
    restIndex: 0,
    next: "Open a MUSD loan on Mezo once, add your vendors as payees, then pick “Pay with a BTC loan” when you approve.",
  },
]

export function templateById(id: string | null): Template | undefined {
  return TEMPLATES.find((t) => t.id === id)
}
