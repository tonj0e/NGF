---
title: 00 BRAIN
section: Home
status: current
last_verified: 2026-10-17
tags: [ngf, brain,home]
---

# 00 BRAIN
**The one page that explains the NGF FINCORP CRM. Read this first; every section below has its own brain note.**

## What this project is
A weekly microfinance CRM. **Guarantors** bring in customers, **field agents** verify them and collect, **Staff and Admin** approve loans, record cash and pay commissions. It is one web app (Next.js 16, React 19, Supabase) used mostly on phones.

## The loan in six steps
1. A **Guarantor** submits a lead for a customer.
2. **Admin or Staff** assigns a field agent.
3. The **agent** visits, takes photos and submits verification.
4. **Admin or Staff** approves. The system creates the customer, the loan and 10 weekly repayment rows.
5. Every **Saturday** the weekly amount is collected and recorded; guarantors hand the cash in and it is settled.
6. When all weeks are paid the loan completes. A **renewal** can start a new loan.

## The money (built-in product 10K10W)
| Item | Amount |
|---|---|
| Loan principal | Rs 10,000 |
| Interest, taken upfront | Rs 1,500 |
| Guarantor commission (part of that interest) | Rs 500 |
| Cash paid out to the customer | Rs 8,500 |
| Repayment | 10 weekly payments of Rs 1,000, every Saturday |

Details and edge cases: [[Loan Products and Math]], [[Repayments and Collections]].

## Where to look
| Section | Brain note | Answers |
|---|---|---|
| Architecture | [[Architecture Brain]] | How the app is built, login, data access |
| Roles and Screens | [[Roles and Screens Brain]] | Who sees what, screen map, mobile layout |
| Loan Lifecycle | [[Loan Lifecycle Brain]] | Lead to loan, renewals, guarantors |
| Money | [[Money Brain]] | Collections, settlements, commissions, deposits, UTR payment matching, dashboard figures |
| Field and Org | [[Field and Org Brain]] | Branches, staff, agents, notifications, files |
| Database | [[Database Brain]] | Tables, status values, drift between repo and live |
| Security | [[Security Brain]] | The 2026-10-17 audit, 24 open leads, fix plan |
| Runbook | [[Runbook Brain]] | Run it, restart it, test accounts, troubleshooting |
| Decisions | [[Decisions Brain]] | Why things are the way they are |
| Daily Log | [[Daily Log Brain]] | What changed each day |

## Rules for working on this project
1. **Never put secrets in notes or code** (keys, tokens, passwords). Use `.env.local`. The old `BRAIN.md` and `log.md` broke this rule.
2. **Back up before risky changes.** The project is not a git repository.
3. **Test each change as each role** (Admin, Guarantor, Agent, Staff). See [[Test Accounts]].
4. **Read the Next.js 16 docs** in `node_modules/next/dist/docs/` before writing Next code (see `AGENTS.md`); this version differs from older ones.
5. **Update the matching brain note** when a change alters how something works, and add a line to today's [[Daily Log Brain|daily log]].

## Where we are (2026-10-17)
- Security audit finished: 24 open leads, **no code fixed yet** (waiting for the build to finish). See [[Open Security Leads]] and [[Security Fix Plan]].
- New 2026-10-18: **Payment Matching** (UTR payments, duplicate flagging, diagram records, bank check). See [[Payment Matching]] and [[2026-10-18]].
- New 2026-10-19: **Verification Day Routes** (branch call + visit plan, road-distance ordering of each agent's day, drag reorder, My Route, Assistant Branch Manager role, branch on every lead). See [[Verification Day Routes]] and [[2026-10-19]].
- Recent changes: guarantor edit (username, password, delete), dashboard card layout and recollection meter, collection payment-mode fix, dev server auto-start. See [[2026-10-17]].

## Related
- [[Start Here - Obsidian Setup]]
