---
title: Lead 15 Receipt print window XSS
section: Security
status: open
last_verified: 2026-10-17
priority: 15
area: Client
fix_step: fix-9
fingerprint: commissions-receipt-unescaped-customer-name-document-write
tags: [ngf, security, lead, client]
---
# Lead 15 Receipt print window XSS
**Agent to guarantor's browser. Status: open, not yet fixed. Needs validation (nothing was run).**

## What the source shows
buildReceiptHtml in CommissionsPage inserts loan customerName and session.name into an HTML template without escaping, then document.write()s it into a window.open('') popup that shares the app origin. A customer name containing markup, planted by an assigned NGF AGENT through submitVerification (and carried into Customers.Name on loan approval), would execute script in the Guarantor's browser when they download or print a payout receipt. The script could read localStorage ngf_token and call the API as that Guarantor.

## Source trace
1. `app/api/leads/[leadId]/route.ts:135`: Assigned agent supplies body.customerName with no markup filtering. It is stored as Leads 'Customer Name'.
2. `app/api/leads/[leadId]/route.ts:338`: Customer 'Name' is created from lead['Customer Name'].
3. `app/api/loans/route.ts:48`: customerName is returned from the Customers 'Name' field to the client.
4. `components/pages/CommissionsPage.tsx:114`: `<td>${l.customerName}</td>` is interpolated raw into the HTML string. session.name is likewise interpolated raw at line 148.
5. `components/pages/CommissionsPage.tsx:191`: w.document.write(html) into window.open('', '_blank'). The popup inherits the opener's origin.

## Why it is not confirmed
- No browser execution: no OS-enforced sandbox with memory limits on this host; target code was not executed.
- Whether the deployed origin or proxy sends a CSP that blocks inline event handlers in the popup was not observed. The source sets none.
- Browser behavior for a window.open('') popup inheriting the opener origin was not observed.

## How to check it (safe, dummy data)
In a local dummy-data instance, as a dummy assigned agent, submit verification with customerName set to `<img src=x onerror=alert(document.domain)>`. Approve the lead as Admin, log in as the dummy Guarantor, open Commissions, request a payout and click download receipt. Expected: the handler fires in the popup. Fix by HTML-escaping all interpolated values (including quotes) or building the receipt with DOM APIs.

## Owner check
Owner confirms that no CSP or other response header on the production origin blocks inline event handlers or script.

## Related
- [[Open Security Leads]], [[Security Fix Plan]] (step 9), [[Security Brain]]
