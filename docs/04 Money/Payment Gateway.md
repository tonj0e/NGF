---
title: Payment Gateway
section: Money
status: current
last_verified: 2026-10-21
tags: [ngf, money, payments, gateway, whatsapp, closure]
---
# Payment Gateway
**One line: customers pay weekly instalments, or close the whole loan, online through a payment link or QR from the bank's gateway; the bank's webhook credits the repayments through Payment Matching. Built 2026-10-21 against a practice gateway; the bank's own adapter is still to be written.**

## Key facts
- **Who sends links:** a **Guarantor** searches the customer's 4-digit pay code (the digits of the loan ID, see [[Payment Matching]]) and sends the link on WhatsApp. **Branch staff** (manager, assistant manager, accountant of that branch) and **Admin** can do the same for any customer in their scope and also **close a loan by payment**. Guarantors cannot close loans.
- **Screen:** "Payment Links" (`components/pages/PaymentLinksPage.tsx`, view key `payLinks`; guarantor menu "Send Payment Link"; Staff permission `paymentLinks`; guarantor permission `gp:payLinks`). A link shows the breakdown, a **QR** the customer scans, **Send on WhatsApp**, copy message, copy link, and updates itself when paid (`LinkPanel.tsx`, polls `/api/payment-links/:id`). The early-close dialog also has "Customer pays online instead".
- **Amounts are computed on the server** (`lib/paymentLinks.ts`): weekly link = every unpaid week due up to this Saturday (overdue + this Saturday) that has no payment recorded; closing link = all unpaid weeks. The browser never sends an amount.
- **Gateway fee:** Dev > Payments sets a percentage (default 0) that is added to what the customer pays and shown on the link, the WhatsApp text and the pay page. The loan is credited the normal amount only (`payment_links.base_amount`; `fee_amount` and `total_amount` kept). Owner expects about 3%. Confirm with the bank or a lawyer that charging it is allowed.
- **WhatsApp message** (`whatsappMessage`): NGF FINCORP, customer name, loan ID, the weeks with dates and amounts, amount, fee line (only if above 0), total, the link, expiry (48 h), a warning never to share OTP or UPI PIN. Sent with a `wa.me` link from the sender's own WhatsApp; fully automatic sending would need the WhatsApp Business API (not built).
- **Webhook** `POST /api/gateway/webhook` (public; the address to give the bank is shown in Dev > Payments): signature checked by the active adapter, then `settleFromEvent`: amount must equal the link total (else status `Mismatch`, nothing credited, Admin notified); the link is claimed atomically so a repeated webhook does nothing; the repayments are recorded with `recordGatewayPayment` (`lib/payments.ts`) as a **Verified** Payment Matching group whose UTR is the gateway reference (duplicates blocked, bank-statement check works), repayments Paid, `collections` rows, loan completion; a late payment on an expired link is still credited. If crediting fails, the claim is released and the webhook answers 500 so the gateway retries; Admin is notified.
- **Closing by payment:** the link stores the mode (Close & Hold or Close permanently + reason). When the money arrives, every remaining week is credited, the loan completes and `finalizeClosure` (`lib/loanClosure.ts`, shared with the cash route) sets the hold or the permanent block. See [[Customer OTP and Disbursement]].
- **Rules:** one open link per loan and kind (partial unique index); an identical open link is reused; a different one cancels the old; links expire after 48 h; max 40 links an hour per user; every link creation is audited (`PAYMENT_LINK_CREATED`).

## Providers (`lib/gateway/`)
- `GATEWAY_PROVIDER=simulator`: **practice gateway**, local development only (refused on the live site by `isProductionEnv()`). Hosted practice page at `/pay-sim/<linkId>`; `/api/gateway/simulate` plays the bank and posts a correctly signed webhook. `GATEWAY_WEBHOOK_SECRET` signs it (defaults to a value derived from `JWT_SECRET`).
- `GATEWAY_PROVIDER=bank`: `lib/gateway/bank.ts` is a **stub**: it needs the bank's API documentation (create link, webhook signature and fields). Only that one file changes when the bank replies.
- On the live site nothing is connected until `bank` is set, so the buttons answer "Online payment is not connected yet".

## What to ask the bank
1. A payment link API (or hosted checkout, or dynamic UPI QR) and its sandbox (a practice environment with fake money and test credentials).
2. Webhook / callback with a signature, plus a payment-status API to check a missed callback.
3. Settlement: report (file or API) and how fast the money arrives (owner believes instantly).
4. Fees by mode (UPI, cards, net banking), refund API, whether the bank itself is a licensed payment aggregator, and the sample webhook payload.

## Table
`payment_links` (migration `20261021200000_payment_links.sql`, applied 2026-10-21): link_id, kind weeks/closure, loan, customer, repayment_ids[], base/fee/total, closure_mode/reason, status (Created, Paid, Failed, Expired, Cancelled, Mismatch, Error), provider, short_url, gateway_payment_id (unique), payment_method, expiry, creator. RLS on.

## Tested (practice gateway, demo data, then removed)
24 checks: search by code, other guarantors cannot see or link the customer, guarantors cannot close, fee maths (2000 + 3% = 2060), message and QR, link reuse, bad signature refused, wrong amount flagged and not credited, failed payment, real payment credits two weeks (collections, Verified group), replayed webhook ignored; closing by payment completes the loan and holds the customer until the original end date.

## Not done
- Bank adapter (waiting for the bank), automatic WhatsApp sending, refunds, settlement reconciliation against the bank file, a per-branch scope for Staff search beyond the branch-role check, sending the link by SMS.

## Related
[[Payment Matching]], [[Repayments and Collections]], [[Customer OTP and Disbursement]], [[Money Brain]], [[Decision Log]]
