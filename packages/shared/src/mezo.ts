// The few Mezo MUSD contract calls Ìpín reads for borrow-to-pay (R13).
// Signatures from mezo-org/musd (BorrowerOperationsSignatures.sol,
// BorrowerOperations.sol, TroveManager.sol, PriceFeed.sol).
import { parseAbi } from "viem"

export const mezoBorrowerOperationsSignaturesAbi = parseAbi([
  "function getNonce(address user) view returns (uint256)",
  "function borrowerOperations() view returns (address)",
])

export const mezoBorrowerOperationsAbi = parseAbi([
  "function troveManager() view returns (address)",
  "function borrowingRate() view returns (uint256)",
])

export const mezoTroveManagerAbi = parseAbi([
  "function priceFeed() view returns (address)",
  "function getTroveStatus(address borrower) view returns (uint8)",
  "function getTroveColl(address borrower) view returns (uint256)",
  "function getTroveDebt(address borrower) view returns (uint256)",
  "function getTroveMaxBorrowingCapacity(address borrower) view returns (uint256)",
])

export const mezoPriceFeedAbi = parseAbi([
  "function fetchPrice() view returns (uint256)",
])

/** TroveManager `Status.active`. */
export const TROVE_ACTIVE = 1

/** Mezo's minimum collateral ratio (LiquityBase.MCR), 18 decimals. */
export const MEZO_MCR = 11n * 10n ** 17n

/**
 * The app refuses a checkout that would leave the trove under this ratio
 * (docs/wave2.md 4a, proposed safety margin: 150%, Mezo's CCR).
 */
export const BORROW_SAFETY_RATIO = 15n * 10n ** 17n
