import {
  encodeAbiParameters,
  getAddress,
  hashStruct,
  hashTypedData,
  keccak256,
  parseAbiParameters,
  toHex,
} from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { describe, expect, it } from "vitest"

import {
  hashPaymentRequest,
  mezoTestnet,
  type PaymentRequest,
  paymentRequestDomain,
  paymentRequestTypedData,
  paymentRequestTypes,
  randomNonce,
  recoverPaymentRequestSigner,
  recoverWithdrawMusdSigner,
  vaultAbi,
  withdrawMusdDomain,
  withdrawMusdTypedData,
} from "../src"

const sender = privateKeyToAccount(
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
)
const vault = getAddress("0x5fbdb2315678afecb367f032d93f642f64180aa3")
const domain = paymentRequestDomain(mezoTestnet.id, vault)
const request: PaymentRequest = {
  potId: 1n,
  payee: getAddress("0x000000000000000000000000000000000000bEEF"),
  amount: 2n * 10n ** 18n,
  itemHash: keccak256(toHex("items")),
  nonce: 3n,
  expiry: 4n,
}

describe("EIP-712 PaymentRequest", () => {
  it("type string matches the on-chain typehash (PaymentRequest.t.sol)", () => {
    const typeString =
      "PaymentRequest(uint256 potId,address payee,uint256 amount,bytes32 itemHash,uint256 nonce,uint256 expiry)"
    const expected = keccak256(
      encodeAbiParameters(
        parseAbiParameters(
          "bytes32, uint256, address, uint256, bytes32, uint256, uint256",
        ),
        [
          keccak256(toHex(typeString)),
          request.potId,
          request.payee,
          request.amount,
          request.itemHash,
          request.nonce,
          request.expiry,
        ],
      ),
    )
    expect(
      hashStruct({
        data: request,
        primaryType: "PaymentRequest",
        types: paymentRequestTypes,
      }),
    ).toBe(expected)
  })

  it("fields match the execute() ABI tuple", () => {
    const execute = vaultAbi.find(
      (x) => x.type === "function" && x.name === "execute",
    )
    expect(execute?.type).toBe("function")
    const tuple = execute?.type === "function" ? execute.inputs[0] : undefined
    const components =
      tuple && "components" in tuple ? tuple.components : undefined
    expect(components?.map((c) => ({ name: c.name, type: c.type }))).toEqual(
      paymentRequestTypes.PaymentRequest.map((f) => ({ ...f })),
    )
  })

  it("domain is Ipin v1 on Mezo testnet", () => {
    expect(domain).toEqual({
      name: "Ipin",
      version: "1",
      chainId: 31611,
      verifyingContract: vault,
    })
  })

  it("test_R8_recoversSenderAndRejectsAlteredField", async () => {
    const signature = await sender.signTypedData(
      paymentRequestTypedData(domain, request),
    )
    expect(await recoverPaymentRequestSigner(domain, request, signature)).toBe(
      sender.address,
    )
    const altered = { ...request, amount: request.amount + 1n }
    expect(
      await recoverPaymentRequestSigner(domain, altered, signature),
    ).not.toBe(sender.address)
    const otherDomain = paymentRequestDomain(31612, vault)
    expect(
      await recoverPaymentRequestSigner(otherDomain, request, signature),
    ).not.toBe(sender.address)
    expect(hashPaymentRequest(domain, request)).toMatch(/^0x[0-9a-f]{64}$/)
  })

  it("randomNonce is 256-bit and varies", () => {
    const a = randomNonce()
    const b = randomNonce()
    expect(a).not.toBe(b)
    expect(a < 2n ** 256n && a >= 0n).toBe(true)
  })
})

describe("Mezo WithdrawMUSD (R13)", () => {
  const bos = getAddress("0xD757e3646AF370b15f32EB557F0F8380Df7D639e")
  const loan = {
    amount: 1_250_000_000_000_000_000n,
    borrower: sender.address,
    recipient: vault,
    nonce: 0n,
    deadline: 1_793_809_149n,
  }

  it("test_R13_borrowSignatureMatchesMezoDigest", async () => {
    // Mezo's _verifySignature, byte for byte:
    // keccak256(encodePacked(TYPEHASH, abi.encode(amount, borrower, recipient), nonce, deadline))
    const typehash = keccak256(
      toHex(
        "WithdrawMUSD(uint256 amount,address borrower,address recipient,uint256 nonce,uint256 deadline)",
      ),
    )
    const structHash = keccak256(
      `${typehash}${encodeAbiParameters(
        parseAbiParameters("uint256, address, address"),
        [loan.amount, loan.borrower, loan.recipient],
      ).slice(2)}${encodeAbiParameters(parseAbiParameters("uint256, uint256"), [
        loan.nonce,
        loan.deadline,
      ]).slice(2)}`,
    )
    const domainSeparator = keccak256(
      encodeAbiParameters(
        parseAbiParameters("bytes32, bytes32, bytes32, uint256, address"),
        [
          keccak256(
            toHex(
              "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)",
            ),
          ),
          keccak256(toHex("BorrowerOperationsSignatures")),
          keccak256(toHex("1")),
          BigInt(mezoTestnet.id),
          bos,
        ],
      ),
    )
    const mezoDigest = keccak256(
      `0x1901${domainSeparator.slice(2)}${structHash.slice(2)}`,
    )

    const typed = withdrawMusdTypedData(
      withdrawMusdDomain(mezoTestnet.id, bos),
      loan,
    )
    expect(hashTypedData(typed)).toBe(mezoDigest)
    const signature = await sender.signTypedData(typed)
    expect(
      await recoverWithdrawMusdSigner(
        withdrawMusdDomain(mezoTestnet.id, bos),
        loan,
        signature,
      ),
    ).toBe(sender.address)
  })
})
