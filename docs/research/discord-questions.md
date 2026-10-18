# Discord questions (ready to paste)

Paste in the Mezo Discord hackathon/dev channel:

---

Hi Mezo team! We're building **Ìpín** for the Buildathon. It's purpose-bound remittance: a sender funds MUSD "pots" (for example, building a house), a requester asks for itemized spends, the sender approves, and vendors get paid. Idle pot balances sit in the MUSD Savings Rate vault. We've read the verified source and found the addresses ourselves. A few things we couldn't find:

1. **Track fit:** does purpose-bound remittance fit **Track 2 (Access & Distribution)**? We plan to submit to both tracks, with the sMUSD vault as the Track 1 angle.
2. **sMUSD vault:** we plan to have a single contract `deposit()` into `MUSDSavingsRate` (testnet `0x6f46…8e16`) and track per-pot shares internally. Is that use OK? Are there plans to change the strategy or upgrade it before 15 Nov, or to add a deposit-for-receiver function? And is weekly yield also distributed on testnet?
3. **Banxa:** can a third-party dApp send users to Banxa to buy MUSD on Mezo delivered to an address of our choosing? Is there a referral URL or partner subdomain we can use, and what is the `blockchain` code for Mezo? Anything for testnet, or should we mock it?
4. **Wallets for non-crypto users:** Passport covers BTC and EVM wallets only. Is there a recommended passkey, email or embedded wallet provider that supports Mezo (31611/31612)? Is the P-256 precompile (RIP-7212 at `0x100`) officially enabled?
5. **Account abstraction:** EntryPoint v0.7 and Safe4337Module are deployed, but we found no public bundler or paymaster. Does any bundler support Mezo? Is EIP-7702 supported on mezod v13?
6. **EVM version:** the docs say `london`, but Cancun opcodes (and even CLZ) execute on both networks. Is `evm_version = cancun` officially supported for mainnet deployments?

Thanks!
