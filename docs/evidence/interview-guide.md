# Sender evidence: interview and test guide

The Wave 1 judges asked for evidence from real senders. This guide gets it in two short sessions
per person: a 10-minute interview about how they send money today, then a 10-minute test of Ìpín
on Mezo testnet. Aim for **5 people**. Three is the minimum worth reporting.

## Who to talk to

- Someone who **sends money home regularly** (UK, US, Canada, Gulf → Nigeria, or any similar
  corridor). Best: someone who has funded a build, school fees or a family allowance.
- Mix: at least one person who has never used a crypto wallet, and at least one who holds BTC.
- Not teammates, not people who helped build Ìpín.

Ask first: "Can I quote you by first name and city, or would you rather stay anonymous?" Write
the answer down. No surnames, phone numbers or wallet addresses in the repo.

## Part 1: interview (10 minutes, before showing anything)

Ask the questions in order. Don't explain Ìpín yet. Write down their words, not your summary.

1. When did you last send money home? What was it for?
2. How did you send it? What did it cost, and how long did it take?
3. After it arrived, how did you know what it was spent on?
4. Has money you sent ever been spent on something else, or "disappeared"? What happened?
5. If you could control one thing about money after you send it, what would it be?
6. Have you paid for something big over months from abroad (a build, school, a business)? How did
   you track it?
7. (BTC holders only) Have you sold BTC to send money or pay a bill? How did that feel?

## Part 2: test on Mezo testnet (10 minutes)

Setup before the call: MetaMask on Mezo testnet with test BTC and some MUSD from
https://faucet.test.mezo.org. Use your own laptop if they don't have a wallet; that's fine, write
it down.

Give each task in one sentence, then **stay quiet** and watch. Note where they hesitate or ask.

| # | Task to read out | What to note |
| --- | --- | --- |
| 1 | "Create two pots, House and Upkeep, and put $10 into them." (https://ipin-ten.vercel.app/send) | Did they understand the split and the monthly limit? |
| 2 | "Your cousin needs cement. Send them an invite to ask for it." | Did they find the invite link? |
| 3 | (On your phone as the cousin) raise a request for 2 bags at $1. "Approve it." | Did they check the items before approving? |
| 4 | "Pay your cousin $1 a month automatically from Upkeep." | Found the allowance? Clear when it pays? |
| 5 | Open a merchant link you made at `/merchant`. "Subscribe to this gym." | Did the terms make sense? Trust? |
| 6 | (BTC holders) "Pay this request with a BTC loan instead." | Did they understand the loan and the ratio? |

## Part 3: three closing questions

1. On a scale of 1–5, how likely are you to use this for real money? Why that number?
2. What would stop you?
3. What would you pay for it? (Show the fee: $0.25 per payment.)

## Recording results

Add one row per person to the table below (first name/city or "Anonymous") and keep raw notes
out of git if they contain anything personal.

| Who | Sends to / for | Biggest pain today (their words) | Tasks done unaided | Likely to use (1–5) | Would stop them | Quote |
| --- | --- | --- | --- | --- | --- | --- |
| | | | | | | |

When three or more rows are filled, the Wave 2 form text (docs/evidence/wave2-form.md) gets a
two-line summary and the best two quotes.
