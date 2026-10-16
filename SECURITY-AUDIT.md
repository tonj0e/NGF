# NGF CRM Security Audit

*Run 1, 17 Oct 2026. Source-only audit: no target code was run. The project has not been changed.*

**Contents:** Part A is the full audit report and all 24 leads in detail. Part B is the fix plan to follow after the build is complete.

---

## Part A. Audit report


### 1. Run summary

- **Profile:** `standard`. **Scope:** whole repository (`scope_paths: ["."]`). **Budget:** none set. About 84 agent invocations, 12 of which were re-runs after a usage-limit interruption.
- **Source ref:** no version control. The tree hash prefix is `1da0dc2200b1a251`, computed over app, components, lib, types, supabase, migrations, public, root `*.sql`, `package*.json`, `next.config.ts` and `tsconfig.json`. Audited 2026-10-17.
- **Execution policy:** `sandboxed-source-and-local-only`. **No target code was executed.** macOS has no way to enforce memory limits or a network namespace, so the required OS sandbox could not be assembled. Every conclusion is therefore source-only. Any claim whose decisive fact is a runtime result is reported as *needs validation* with that exact blocker, and **there are zero confirmed findings by design of the evidence rule**, not because nothing was found.
- **Prior runs:** none. Informal earlier study notes were used only as leads and re-derived from source. They were wrong in at least one place (see section 6, `lead-approve-loan-…`).
- **Coverage:** three hunting waves (39 + 12 + 3 areas, plus 3 re-reviews), three independent coverage critics, the last of which accepted no further work. Declared complete: **54 coverage units, 0 deferred, 0 out of scope**.
- **Review depth:** each lead was attempted to be disproved by one fresh verifier, then re-read line by line by a second fresh reviewer. Six records received line-number or wording corrections; none changed a verdict.

### 2. Security posture

The app has strong basics (bcrypt, password-version token revocation, a well-built reset flow, no dangerous HTML sinks reachable by low-trust users, a clean lockfile) and a recurring weakness: **authorization is decided per route, with only a role label in the token and the database accessed with an all-powerful key.** So whenever a handler checks only "is logged in" instead of "owns this record", a low-privilege account reaches other people's data. Most leads below are that pattern. Three are more urgent because they need no account at all or concern credentials: the open dev migration route, secrets written in plain text in project notes, and the spoofable login rate limit.

### 3. Confirmed findings

None. No lead could be observed running (see execution policy), so none qualifies as confirmed.

### 4. Confirmed-finding detail

None. See `NEEDS-VALIDATION.md` for the full source trace, blockers and test plan of each lead.

### 5. NEEDS VALIDATION (24 leads, no severity)

Suggested review order, by who the attacker is and what they could reach. This is not a severity ranking.

| # | Lead | Boundary (who → what) | Exact blocker | Local next step | Owner check |
|---|---|---|---|---|---|
| 1 | **Unauthenticated GET /api/dev/migrate-db upserts Google Sheets data over live Supabase tables** (`dev-migrate-db-get-unauthenticated-sheet-to-db-overwrite`) | Unauthenticated caller → production tables (users, loans, money) | Whether the live Sheets tabs use headers that map to Supabase column names is unknown. Title Case headers make every upsert fail with a column error,… | In an isolated fixture with dummy Supabase and Sheets stubs and no real credentials, call GET /api/dev/migrate-db?table=Users&dryRun=true w… | Without calling the live endpoint, the owner checks whether the configured spreadsheets contain the tabs with data and which header style t… |
| 2 | **Live-looking Supabase service-role key, Google OAuth secret and admin credentials written in unignored root docs** (`secrets-committed-in-brain-and-log-docs`) | Anyone who can read the project files → full database and Google Drive access | Cannot establish from source who can read this directory or whether it was ever pushed, shared or synced. The directory is not a git repository, so V… | Run a read-only secret scan (for example grep for the eyJ JWT prefix and GOCSPX- over the tree and any VCS history or published copies). Co… | Owner should check whether the repo or these files were ever pushed or shared. Rotate the Supabase service-role key, the Google OAuth clien… |
| 3 | **POST /api/repayments lets any authenticated user mark any repayment Paid, replay it, or overwrite its status** (`repayments-post-no-role-ownership-or-state-guard`) | Any logged-in user → any customer's repayment and collection records | The intended policy is not visible in source: which roles are meant to record repayments, and whether Guarantors may record repayments only for their… | On a dummy Supabase project, create two dummy guarantors A and B and a loan with repayments for B. Call POST /api/repayments with A's beare… | The owner confirms which roles may record repayments and whether Guarantors may record only for their own loans. The owner also confirms wh… |
| 4 | **QR step-up login can be completed by anyone holding the password, using the uid read from the preAuth token** (`qr-stepup-factor-is-public-uid-in-preauth-token`) | Password-only attacker → second login factor (when enabled) | Whether qrlogin:<role> is enabled in the deployed Settings table is not source-visible. Admin is exempt in code and the feature is off unless the val… | With dummy users and a dummy JWT_SECRET of 32 or more characters, call the login handler with a valid dummy password for a non-Admin user w… | The owner checks whether Settings rows qrlogin:Guarantor, qrlogin:NGF AGENT or qrlogin:Staff equal '1' in production. If none do, the step-… |
| 5 | **File proxy lets any authenticated user read any stored customer document or any Drive file the OAuth account can access** (`drive-proxy-any-session-reads-any-object-no-ownership-binding`) | Any logged-in user → any customer's documents and any Drive file | Which object paths or Drive IDs a Guarantor or Agent can learn is not traced. List endpoints may expose document URLs only for scoped records. | Use a dummy Supabase storage fixture. Create two guarantors with one customer each and an uploaded document under customer-docs. Log in as… | The owner checks which API responses expose document URLs or Drive IDs to Guarantor and Agent roles, whether the customer-docs bucket is pu… |
| 6 | **Session tokens keep old role and survive account deactivation or role change for up to 24 hours** (`session-role-and-status-not-rechecked-per-request`) | Demoted or deactivated user → old privileges for up to 24 h | The update_guarantor_atomic RPC definition is not in the repo, so whether it writes users.status without changing password_hash or blocked_until is n… | With dummy data, issue a token for a dummy Admin, change that user's Role to Guarantor via the PATCH /api/staff handler without supplying a… | Owner checks the update_guarantor_atomic function body in the Supabase project to see whether it sets users.status, and whether any other f… |
| 7 | **Permanent user block is stored as NULL blocked_until and is never enforced** (`permanent-block-stores-null-blocked-until-not-enforced`) | Admin's permanent block → not enforced | The production DB state is not source-visible. Source shows only ADD COLUMN IF NOT EXISTS in the migrations, so any trigger or default rewriting NULL… | With a dummy Supabase project or a mocked getSupabase, call the POST handler as a dummy Admin with duration 'permanent' for a dummy non-adm… | The owner checks, on a dummy account in a non-production project, that the users table has no trigger or default that rewrites NULL blocked… |
| 8 | **Any NGF AGENT can submit or overwrite verification for any lead, regardless of assignment or lead status** (`lead-submit-verification-missing-assigned-agent-check`) | Any field agent → other agents' leads and customer PII | The attacker needs another agent's leadId. The ID format and whether it is exposed to other agents (makeId('LEAD') at app/api/leads/route.ts:113, not… | With dummy data in a local or staging stack, create lead L assigned to agent A and a lead in Approved status. Authenticate as a separate du… | Owner check: confirm that no database trigger or constraint on the Leads table blocks the update. Also confirm whether lead IDs are guessab… |
| 9 | **NGF AGENT can read any agent's attendance and trip GPS history via agentId parameter** (`agent-attendance-trips-get-agentid-idor`) | Any field agent → other agents' GPS history | A decisive runtime fact is unobserved: whether an NGF AGENT can learn another agent's Agent ID, which is needed to exploit this. The source does not… | Use dummy data only. Create two Agents rows (A and B) with users, plus AgentAttendance and AgentTrips rows for each. Authenticate as agent… | Not required beyond confirming that the deployed build matches this source. |
| 10 | **Collection sheet returns all customers' contact and balance data to any authenticated non-guarantor role** (`collection-sheet-get-missing-role-and-agent-scope`) | Any non-guarantor role → every customer's name, phone, balance | Whether product intent allows NGF AGENT (and other non-Admin roles) to see the all-customer collection sheet is not documented in source and needs ow… | With dummy data, call the GET handler with a session whose role is NGF AGENT, no assigned loans and no guarantorId. Expect rows for all dum… | Owner to confirm whether NGF AGENT users are meant to see the all-customer collection sheet. Also confirm which user accounts hold the NGF… |
| 11 | **Dashboard API returns capital, investor and global collection totals to Guarantor and Agent roles** (`dashboard-metrics-expose-capital-and-global-aggregates-to-all-roles`) | Guarantor or agent → capital, investor and global totals | Whether the business intends capital, investor and global collection totals to be visible to Guarantor and Agent users is a product-owner decision. T… | In an isolated environment with a dummy database and a dummy Guarantor session, call the GET handler. Check whether metrics contains totalC… | The owner confirms whether capital and investor totals and global collection figures are meant to be Admin-only. The owner then checks whet… |
| 12 | **Notifications list returns user-targeted notifications to every user with the same role** (`notifications-get-role-match-exposes-per-user-notifications`) | Guarantor or agent → peers' lead decisions | The deployed notifications table definition (whether user_id is nullable and whether notifyUser rows persist both user_id and role) must be observed… | With a dummy-data harness that stubs readTable('Notifications') with two rows (one notifyUser-shaped with User ID=G1 and Role='Guarantor',… | Owner check: in the live Supabase notifications table, confirm that rows created by notifyUser carry a non-null user_id plus a role value,… |
| 13 | **Auth rate limiter keys on client-controllable X-Forwarded-For, enabling login throttle bypass** (`rate-limit-key-trusts-client-x-forwarded-for`) | Unauthenticated attacker → unlimited password guesses | Whether the production reverse proxy overwrites or appends x-forwarded-for is not source-visible (it also depends on the hosting platform). | In a sandboxed harness with dummy NextRequest objects, call authRateLimit 11 times with a distinct x-forwarded-for value each time and asse… | The owner sends two requests through the production proxy with a forged X-Forwarded-For header and inspects what the app receives, or revie… |
| 14 | **Renewal approval trusts a client-supplied customer id in lead notes, with no ownership or eligibility check** (`renewal-lead-source-customer-from-notes-not-bound-to-guarantor-or-eligibility`) | Guarantor → renewal loan on another guarantor's customer | Impact depends on whether Admin or Staff review in the UI shows the Notes field and the notes-bound customer. That UI behaviour is not confirmed from… | In a dummy dataset with two guarantors (A and B), each with one customer, post a RENEWAL lead as guarantor A with notes naming guarantor B'… | Owner check: in the lead review UI, confirm whether the Notes field and the target customer are shown to the approving Admin or Staff befor… |
| 15 | **Stored XSS in guarantor commission receipt print window via customer name** (`commissions-receipt-unescaped-customer-name-document-write`) | Field agent → script in a guarantor's browser session | Whether the deployed origin or proxy sends a CSP that blocks inline event handlers in the popup was not observed. The source sets none. | In a local dummy-data instance, as a dummy assigned agent, submit verification with customerName set to `<img src=x onerror=alert(document.… | Owner confirms that no CSP or other response header on the production origin blocks inline event handlers or script. |
| 16 | **Stored XSS in ID-card print window via unvalidated profile photo value** (`idcard-photo-src-unescaped-document-write`) | Staff → script in another user's (e.g. Admin's) browser session | Whether Staff is a lower-trust principal than Admin is a policy decision. The route only enforces requireRole(['Admin','Staff']), so Staff can write… | Use dummy accounts in a disposable local environment. As dummy Staff, POST /api/profile with userId set to the dummy Admin's id and photo s… | The owner confirms that Staff is meant to be lower-trust than Admin, and that no CSP or proxy header blocks inline handlers on the deployed… |
| 17 | **Google Drive query injection through customer name in getOrCreateFolder** (`drive-folder-query-unescaped-customer-name`) | Lead submitter → documents filed in another customer's Drive folder | Google Drive q parser precedence for 'or' versus 'and' and its handling of the injected clause is provider-side behavior and was not observed. | With a mocked googleapis Drive client (no network, dummy IDs), call getOrCreateFolder('PARENT', "x' or mimeType='application/vnd.google-app… | Owner, on a test Drive account with two dummy folders, submits a lead with the crafted customerName and a photo. The owner then checks whet… |
| 18 | **Supabase Storage object key built from raw client file name or type with upsert enabled** (`storage-object-key-from-unsanitized-client-filename`) | Any logged-in user → overwrite other storage objects | The forced prefixes `${Loan ID}/${ts}_` and `${userId}/profile.` limit any overwrite to keys reachable through traversal, and the timestamp makes exa… | Against a local Supabase Storage test project with dummy buckets and objects, call the upload with fileName `../OTHERLOAN/x.jpg` and photoF… | Owner checks the payment-proofs and profiles bucket settings in the Supabase dashboard (public/private, allowed MIME types, file size limit… |
| 19 | **RLS not enabled on agent_trips and agent_attendance; branch_staff_roles and guarantor_branches undefined in repo SQL** (`rls-not-enabled-on-agent-trips-attendance-and-branch-tables`) | Holder of the public Supabase key → agent and branch tables | Live RLS and grant state of the Supabase project is not source-visible (RLS may have been enabled out-of-band, or Supabase's default for tables creat… | Grep all *.sql for ENABLE ROW LEVEL SECURITY per table and diff against TABLE_MAP values in lib/supabase-db.ts; already done in source: age… | Owner runs in the Supabase SQL editor: select tablename, rowsecurity from pg_tables where schemaname='public' and tablename in ('agent_trip… |
| 20 | **Commission payout PATCH can re-process Paid or Rejected payouts and POST amount is not capped by earned commission** (`commission-payout-patch-no-pending-state-guard`) | Staff or stale screen → re-process a settled payout | Downstream financial effect depends on out-of-band payment practice. The PATCH only records status, and admins review the amount on each request. The… | With dummy data in a local stack, PATCH an already-Paid payout with action 'reject' and observe Status become Rejected with an overwritten… | Owner should confirm the admin payout reconciliation process, whether the displayed requested amount is verified against earned commission… |
| 21 | **Settlement duplicate check depends on a free-text marker and is non-atomic; amounts and recordedBy are unvalidated** (`settlements-post-text-marker-dedupe-and-unvalidated-amounts`) | Staff or forged QR → duplicate or inflated settlement | The live Supabase settlements schema is not observable from source. It is unknown whether column types, a payout-ID unique key, or CHECK constraints… | Use a dummy database with the checked-in schema and dummy Admin credentials. POST two settlements for the same entityId, one with notes 'QR… | The owner should check the live settlements table: column types, any unique index or CHECK on amounts, and the recorded_by FK. They should… |
| 22 | **Deposit withdrawal approval is a non-atomic check-then-act and does not re-validate eligibility** (`deposit-request-approve-nonatomic-no-revalidation`) | Double approval → duplicate ledger debit | Whether concurrent PATCHes actually double-append depends on timing and deployment: single or multiple instances, cache state, and whether the databa… | With dummy Supabase data (or a mocked client) and no real credentials, send two concurrent PATCH calls for one dummy Pending request as a d… | Owner confirms the number of server instances and whether the Deposits table has a unique constraint or trigger preventing duplicate ledger… |
| 23 | **Notification mark-read does not verify the notification belongs to the caller** (`notifications-patch-missing-recipient-check`) | Any logged-in user → another user's read flag | Exploitation needs another recipient's Notification ID. How IDs are generated (guessable or sequential) and whether they are exposed to other users e… | With a local dummy Supabase and two dummy users, user A and user B, create a Notifications row addressed to A. Send PATCH /api/notification… | — |
| 24 | **Authenticated JSON endpoints accept unbounded base64 file bodies with no size or type cap** (`authenticated-json-base64-upload-no-size-cap`) | Any logged-in user → server memory and storage quota | Deployed body-size caps are not visible in source: the reverse proxy (nginx client_max_body_size) or the host (for example Vercel's 4.5 MB function l… | In a memory-limited container with dummy Supabase and Drive mocks, run the Next server and POST /api/leads with a dummy Guarantor token and… | Owner to check the configured maximum request body size at the proxy or host in front of /api/*, and whether one Node process serves all us… |

Every lead also has the blocker "target code was not executed (no OS-enforced sandbox with memory limits on this host)".

**Mostly resolved by one fix each.** Several leads share a single remedy, so fixing them together is cheap:
- *Ownership checks on writes and reads* (repayments, lead verification, agent history, collection sheet, notification mark-read, file proxy, renewal source customer): scope each handler the way the matching `GET` list already does.
- *Admin figures behind a role check* (dashboard).
- *Read the role and status from the database on every request, not only from the token* (session lead, and it also lets the permanent-block fix take effect on open sessions).
- *Remove secrets from `BRAIN.md` and `log.md` and rotate them* (first).

### 6. Hardening notes, positive patterns, and rejected claims

**Positive source patterns**
- Passwords: bcrypt, cost 12. A password change revokes every earlier token (the token carries a hash fingerprint). `lib/auth.ts`, `lib/api.ts`.
- Password reset by email code: random, HMAC-hashed at rest, 10-minute lifetime, 5 attempts, single use, generic responses, old sessions revoked on reset (`lib/otp.ts`, `app/api/auth/reset/route.ts`).
- `/api/setup` fails closed when its secret is unset. `staff` create, edit, delete, block, branches, settings, capital, loans PATCH and import are Admin-only. A deleted user's token is rejected immediately.
- No `dangerouslySetInnerHTML`, `eval` or `new Function` anywhere. Almost all HTML is escaped by React; the unescaped print windows are listed above.
- Database access uses parameterised calls; no request keys become column names; `ilike` input is escaped.
- `package-lock.json` pins 665 packages, all from the public npm registry with integrity hashes; no git or alternate sources.
- `/api/dev/user-password-reset` is the model route: production guard, rate limit, Admin, typed confirmation, password policy and audit entry.

**Rejected claims (not findings)**
- `lead-approve-loan-no-status-guard-replay-destroys-repayments`: re-approving a converted lead was reported as deleting paid repayment history. Source shows the loan-id rewrite is a primary-key update on a table whose children have no `ON UPDATE CASCADE`, so it errors before any delete. A later read-only check of the live database, made outside this audit's evidence rules, agrees (both child keys are "no action"). What remains is a missing status guard that leaves partial state when the error happens.
- `drive-oauth-callback-postmessage-wildcard-origin-no-receiver-origin-check`: the token is posted to any origin, but it cannot be redeemed without the Google client secret that stays on the server. Treated as hardening: send to the page's own origin, add an OAuth `state`, check the sender in the listener.

**Hardening notes from the hunters (no cross-boundary result shown)**
- lib/csrf.ts:61 does not await verifyCsrfToken, so csrfProtection always passes. Await it, make csrfProtection async, and update the 4 callers, or delete the dead control. No current exposure because auth is a Bearer header.
- lib/csrf.ts:5 has a literal fallback for CSRF_SECRET; throw when it is unset, as lib/auth.ts does for JWT_SECRET.
- Login route logs the full list of usernames and submitted usernames to console (app/api/auth/login/route.ts, '[LOGIN] User not found' line), which leaks account enumeration data to logs.
- DEPLOY.md:21 and :49 still document PASSWORD_PEPPER and an iterative-SHA-256 scheme although lib/auth.ts is bcrypt-only; update the docs.
- lib/auth.ts generateSalt uses Math.random (only if used for secrets; no secret use found in this boundary).
- lib/supabase-db.ts updateRow and deleteRow resolve rows by index over a 30 s cached read, which risks modifying the wrong row if callers are still using them; prefer updateById.
- verifyPreAuthToken, verifyTrustToken and verifyResetToken in lib/auth.ts do not pin the algorithm (jose defaults accept HS256 with the symmetric key, acceptable).
- POST /api/profile builds the storage path from the client-controlled body.photoFileType, as profile.${photoFileType}, and also uses it as the MIME type with no allowlist. This is limited to the caller's own folder; the issue is owned by the upload-handling units (hunter-07).
- Several agent routes call requireRole twice in a row (location POST, toggle POST), which causes redundant session DB lookups. This is cosmetic.
- The attendance and trips POST handlers run getSession and csrfProtection before requireRole, so a non-agent receives a CSRF or validation error before 403. This is ordering only and has no authorization impact.
- The location SSE connections Map never deletes empty Set entries, and an Admin or Staff caller-chosen agentId query value creates permanent keys. Delete the key when its Set becomes empty and validate agentId against known agents.
- The agent location POST does not bound accuracy, speed or heading. Clamp them to sane ranges and numeric finiteness.
- readTable uses select('*') with no .range() pagination. Supabase PostgREST caps responses at its max_rows setting (default 1000), so tables above that (Repayments, Logs, Notifications) are silently truncated. This would cause lookup misses and wrong duplicate checks. Owner should confirm max_rows and paginate with .range().
- Login calls readTable('Users', {forceFresh:true}) per unauthenticated attempt, a full-table scan. Replace it with a keyed query (eq username/name/email) to avoid the scan and keep it independent of the limiter.
- app/api/auth/login/route.ts logs the list of all usernames to the console when a user is not found (line 34). Remove it.
- Location and toggle routes call requireRole twice, which is redundant. Clean up.
- Only /api/dev/user-password-reset calls devOnlyGuard(). clear, fix-passwords, seed-admin, migrate-db POST and migrate-images/payment-proofs/profiles stay live in production behind Admin only; add devOnlyGuard() to all of them.
- fix-passwords action fix-all sets the literal password 'password123' (or a request-supplied default) on every user whose hash is not bcrypt, without a policy check or a session-revocation step. If such accounts exist, anyone who knows the username can log in. Replace it with a forced reset flow.
- fix-passwords verify-hash returns the first 20 characters of the stored bcrypt hash, which includes the cost and salt. This is Admin-only and should be removed.
- setup returns the seeded 'Admin@123' password in its response and writes it into the Sheets Users tab. The secret comparison is non-constant-time. Use crypto.timingSafeEqual and generate a random password.
- drive/callback does not catch getToken failure (unhandled exception), and its fallback branch prints the first 20 characters of the refresh token into the page.
- The agent route passes the upstream LLM error message through to the Admin caller; low risk.
- app/api/dev/fix-passwords, clear and seed-admin do not call devOnlyGuard, unlike user-password-reset. They remain reachable by Admin in production. fix-all sets a known default password ('password123') and echoes it in the response, and verify-hash returns a 20-char hash prefix. Add devOnlyGuard, remove the default and the hash…
- lib/supabase.ts stores the client-supplied MIME type with no allowlist, and app/api/drive/[fileId]/route.ts serves it without nosniff or Content-Disposition. Restrict MIME types to image/jpeg, image/png, image/webp and application/pdf, force the stored type server-side, and add X-Content-Type-Options: nosniff and a Content-Disp…
- GET /api/review-options is unauthenticated. It returns only admin-defined labels; add getSession.
- app/api/agent/route.ts has no timeout on the outbound fetch and no length cap on message, and it forwards the upstream status code to the client (an upstream 401 would reach the SPA). Add AbortSignal.timeout, cap message length, and map upstream errors to 502.
- lib/audit.ts extractClientInfo trusts x-forwarded-for but the value is never persisted, so it is currently harmless. If it is ever stored, apply the same trusted-proxy treatment as the rate limiter.
- package.json carries unused or duplicate packages that enlarge the supply-chain surface: next-auth, jsonwebtoken, both bcrypt and bcryptjs, and uuid. Playwright, pg and the supabase CLI are listed in devDependencies. Prefer `npm ci` in DEPLOY.md.
- No server-side logout or token revocation: logout only clears localStorage, so a stolen 24h token stays valid (lib/auth.ts, app/page.tsx).
- qrtrust token is a 365d JWT keyed by uid only, not bound to pv or device, and not revoked by password reset or block (lib/auth.ts createTrustToken).
- preAuth tokens are reusable within 10 minutes (no jti or one-time state); verify-qr and login are limited only by the in-memory authRateLimit.
- login/route.ts logs usernames and the full list of existing usernames on a user-not-found (console.log), and logs the password verification result; remove them.
- login returns 'Account inactive' and the temporary-block message with the block reason before the password is verified, so an unauthenticated caller who knows a username learns account state and the block reason; check the password first.
- verifyToken and the purpose-typed JWTs share one HS256 key with no iss/aud; the t-claim separation is adequate today but a typ/aud claim on session tokens would harden it.
- generateSalt in lib/auth.ts uses Math.random; low impact if the salt is unused (reset writes salt '').
- login/route.ts returns 'Account inactive' and 'Account temporarily blocked until ... Reason: ...' before password verification, which discloses status and block reason to anyone who knows a username. Return the generic 'Invalid credentials' until the password verifies.
- login/route.ts logs the full list of usernames to console on user-not-found, and logs usernames and results. Remove these logs.
- The 365-day qrtrust token binds only uid. Bind it to the pv claim, or set a shorter expiry, so a password change or block revokes remembered devices. It never bypasses the password check.
- staff GET lets the Staff role enumerate Admin accounts and contact details. Consider limiting Staff to non-Admin roles.
- branches POST does not validate that userId, branchId, guarantorId or agentId exist, and deleteBranch ignores dependents. Add existence and dependent checks.
- staff DELETE console.logs full associated records. Remove.
- The customers, loans, dashboard, settlements/due and collections routes read whole tables with forceFresh and join them in memory. This is an availability concern for the resource-exhaustion units, not an authorization issue.
- Dashboard notification filtering by User ID or Role is correct, but Staff callers fall into the agent branch of myLoans and see empty loan metrics. This is a functional quirk, not a security issue.
- capital POST: reject non-finite amounts (Number.isFinite) and add an upper bound; DELETE of ledger entries should be audited or soft-deleted.
- projection route: clamp horizonWeeks, termWeeks and capital to sane bounds.
- approveLoan and approveRenewal do not check available capital before disbursing.
- loan-products DELETE logs full request bodies; findLoanProduct returns soft-deleted products.
- approveRenewal has no lead-status guard, so a replay creates another loan. This is the already-reported lead-approve-loan-no-status-guard-replay-destroys-repayments root cause, owned by hunter-04, and was not re-reported.
- lib/api.ts getSession strips 'Bearer ' with a plain replace, and several state-changing handlers in these units (commissions/payout PATCH, deposits/request PATCH, repayments POST, settlements POST/PATCH) never call csrfProtection, unlike leads/[leadId] PATCH. This is bearer-token auth so classic CSRF is not exploitable, but con…
- readTable caches whole tables for 30 s per instance; several check-then-act business paths (deposit approval, payout pending-check) read without forceFresh, so moving critical state checks to conditional database updates (update ... where status='Pending' returning rows) would remove the stale-cache dependency.
- Record IDs are time-derived (PYOUT/DREQ ${Date.now()}) and could collide under concurrent requests in the same millisecond; use crypto-random IDs.
- In payout PATCH, any action value other than 'reject' is treated as approve; validate action against an allowlist ('approve'|'reject').
- app/api/customers/route.ts DELETE and app/api/leads/[leadId]/route.ts DELETE hard-delete Repayments, Loans and Customers with no active-loan or paid-repayment guard, no audit log, and no invalidateCache call (the lead DELETE also reads uncached tables). Prefer soft-delete (status=Deleted) with an audit entry.
- app/api/import-customer/route.ts is non-atomic. An invalid joinedDate throws after the Lead row is written, which leaves an orphan lead. There is no duplicate phone check, and weekStatusList statuses and agentId are unvalidated.
- app/api/settings/route.ts POST accepts arbitrary keys, and an undefined value is stored as the string 'undefined'. Add a key allowlist.
- app/api/staff/block/route.ts custom endDateTime is stored without date validation, and string comparison is used for timestamps.
- app/api/staff/route.ts POST skips the password policy and validation of role and status values (body.role is arbitrary). Password policy is applied only in the guarantor edit path.
- app/api/deposits/route.ts POST: reject unknown guarantorId and non-finite amounts. Enforce principalWithdrawEnabled and the available-balance and principal caps from computeDepositAccount before appendRow. Validate body.date as YYYY-MM-DD and cap how far it can be backdated, because a backdated Deposit or Interest Payout shifts…
- app/api/deposits/route.ts: the GET summaries and per-guarantor reads load whole Deposits and DepositRequests tables, then filter in JS. This is the whole-table-read pattern already covered by the readTable lead.
- components/pages/GuarantorPage.tsx QrPayoutScanner: the guarantor name fallback (g.name === data.gn) lets a QR that carries a wrong uid match a different guarantor. Require uid to match, and derive amount and guarantor from the server's PayoutRequests row (send only payoutId) rather than posting scanned.amt.
- app/api/loans/route.ts PATCH: add a loan-status guard (e.g. foreclose/settleBalance only on Active loans) and clear the customer's Active Loan ID only when it equals the loan being closed, so a replay cannot detach a newer active loan.
- app/api/loans/route.ts fixDates: validate newStartDate with a strict YYYY-MM-DD parse, and do not shift due dates of Paid repayments.
- app/api/leads/[leadId]/route.ts assignAgent: reject when lead Status is Converted/Approved/Rejected and verify the target agent is active; this also closes one of the entry paths into the known approveLoan replay (fingerprint lead-approve-loan-no-status-guard-replay-destroys-repayments).
- app/api/leads/[leadId]/route.ts DELETE: consider blocking deletion when the lead's loans have Paid repayments and writing an audit record, since cascade deletion is destructive for financial history.
- app/api/leads/[leadId]/route.ts PATCH: the unused first-pass getSession plus csrfProtection precedes the per-action requireRole; a single role gate at the top would be clearer.
- lib/idCard.ts and lib/promissoryNote.ts esc() helpers escape only & < >; add double and single quotes before using them in attribute context.
- submitVerificationSchema mapsLink uses z.string().url() (accepts javascript:, data: and other non-http schemes) and import-customer stores mapsLink unvalidated; add a refine for http/https only. React 19 currently blocks javascript: hrefs.
- ngf_qrtrust is not removed from localStorage when /api/auth/session returns 401 in app/page.tsx; consider clearing it too.
- Logout only deletes the local token; the JWT stays valid server-side up to 24 h (no denylist).
- No CSP or security headers in next.config.ts, which would otherwise limit the impact of the document.write XSS sinks.
- app/api/leads/route.ts swallows photo-upload errors silently (empty catch).
- components/pages/AgentTrackingPage.tsx createInfoWindow interpolates loc.name, loc.phone and loc.agentType into an HTML string for google.maps.InfoWindow without escaping. Today only Admin can write those fields (Staff are viewers), so this is not a privilege crossing. It becomes stored XSS if any lower-privileged route or impo…
- The agent location POST handler calls requireRole twice (redundant, harmless).

**Context observed outside this audit's evidence boundary (not used as evidence).** Before the audit, read-only database queries showed that row-level security is *enabled* on all 25 public tables including `agent_trips`, `agent_attendance`, `branch_staff_roles` and `guarantor_branches`, so the RLS lead is probably a documentation gap (the tables are missing from the repo SQL) rather than an open table. They also showed `loans.customer_id` is `UNIQUE`, which would block renewals (a functional bug, not a security one), and that a function `rls_auto_enable()` can be run through the public API by signed-out users. The last one is not in this report's leads; review it in the Supabase security advisor.

### 7. Coverage summary

- Units: **54**. Covered: **27**. Candidate (has a lead): **27**. Blocked: **0**. Deferred: **0**. Out of scope: **0**.
- Hunters: wave 1 (8 hunters, 39 units), wave 2 (5 hunters: dashboard, customers, session, loans, lead actions, branches, staff, QR payout, deposits, files, dependencies, audit/notifications, plus 3 re-reviews), wave 3 (2 hunters: capital/projection, renewal binding, client pages).
- Critics: after wave 1 (accepted 12 units and 3 re-reviews), after wave 2 (accepted 2 units), final clean critic (accepted nothing; confirmed every route, page and library file with a trust decision is covered).
- Companion guidance used: web protocol and auth, data isolation, client-side, cloud and deployment, resource exhaustion, supply chain. Excluded with reasons: memory safety (memory-safe language), AI/LLM (one admin-only call with no tools or memory), protocols/RPC (plain REST), desktop and mobile IPC (browser app only).
- Not covered: anything that only exists in the deployed environment (proxy headers, live database grants, bucket settings, secret values, hosting), and live behaviour of any lead. The 24 leads list the exact owner checks.


## Part A2. Leads in detail (24)

Each lead has a verified source trace and one unresolved fact. The order is a suggested review order, not a severity ranking. The local plans use dummy data in a throwaway environment you control; the deployment checks are things an owner can read in settings or logs. None asks anyone to send traffic to a live system.


### 1. Unauthenticated GET /api/dev/migrate-db upserts Google Sheets data over live Supabase tables

`dev-migrate-db-get-unauthenticated-sheet-to-db-overwrite`  
**Boundary:** Unauthenticated caller → production tables (users, loans, money)

The GET handler of the dev migration route has its Admin check commented out, and it has no dev-only or production guard. apiHandler only maps thrown errors to status codes and adds no authentication. Any unauthenticated caller can trigger a migration. The service-account Sheets client reads each legacy sheet, and the service-role Supabase client upserts the rows into users, settings, loans, repayments, capital and the other tables. If Sheets holds stale or legacy data, a remote caller could revert passwords and roles, null out password hashes (empty strings listed in EMPTY_STRING_FIELDS become null), and roll back financial state. The `table` query parameter selects a single table, which is not checked against the allowed table list. With dryRun=true the endpoint still drives Google API quota. Whether an overwrite actually succeeds depends on deployment facts that source cannot settle. The hardcoded Title Case headers in SHEETS (for example 'User ID') are passed to upsert unchanged, with onConflict 'user_id'. Unless the live sheet headers are snake_case, PostgREST rejects every row with a column error and nothing is written.

**Claimed root cause.** requireRole(req, ['Admin']) is commented out in GET with a 'Temporarily allow unauthenticated for initial migration' note, and devOnlyGuard is not called. Only the POST handler checks Admin.

**Source trace**

1. `app/api/dev/migrate-db/route.ts:195` (entrypoint, GET handler): No authentication or role check, because the requireRole line is commented out. It reads dryRun and table from the query string.
1. `app/api/dev/migrate-db/route.ts:139` (propagation, migrateTable): Calls readFromSheets(table) and normalises each row with cleanRow. Empty protected fields such as password_hash become null.
1. `lib/sheets.ts:23` (propagation, readTable): Reads the hardcoded spreadsheet IDs from lib/config.ts with the Google service-account client. The first row is used as column keys unchanged.
1. `app/api/dev/migrate-db/route.ts:153` (sink, migrateTable upsert): supabase.from(targetTable).upsert(cleaned, {onConflict: pk}) with the service-role client would overwrite live rows if the sheet keys match column names.

**Evidence**

- `app/api/dev/migrate-db/route.ts:196`: Comment 'Temporarily allow unauthenticated for initial migration' sits above the commented-out requireRole at line 197.
- `app/api/dev/migrate-db/route.ts:227`: POST in the same file enforces requireRole(['Admin']), which shows the intended policy.
- `lib/api.ts:53`: apiHandler only wraps errors and performs no authentication, so no hidden control covers GET.
- `lib/config.ts:35`: SHEETS headers are Title Case ('User ID', 'Password Hash'). The upsert uses these keys unchanged against snake_case primary keys, so a column mismatch may block the write.
- `lib/config.ts:4`: Spreadsheet IDs are hardcoded, so the read target is fixed in source.

**Exact blockers**

- No OS-enforced sandbox with memory limits on this host; target code was not executed
- Whether the live Sheets tabs use headers that map to Supabase column names is unknown. Title Case headers make every upsert fail with a column error, and snake_case headers allow the overwrite.
- Whether GOOGLE_SERVICE_ACCOUNT_KEY is set in production and whether the legacy sheets still hold data is unknown
- Whether the route is deployed and reachable in production, with the dev route not removed or blocked at the proxy, is unknown

**Bounded local next step**

In an isolated fixture with dummy Supabase and Sheets stubs and no real credentials, call GET /api/dev/migrate-db?table=Users&dryRun=true with no Authorization header. Confirm a 200 response and a nonzero success count. Then call it without dryRun against a throwaway Supabase fixture, once with snake_case sheet headers and once with Title Case headers. Confirm the users row is overwritten only in the snake_case case.

**Owner-observed deployment check**

Without calling the live endpoint, the owner checks whether the configured spreadsheets contain the tabs with data and which header style they use. They also confirm whether GOOGLE_SERVICE_ACCOUNT_KEY is set in production, and review access logs for unauthenticated GET /api/dev/migrate-db requests. Fix: restore `await requireRole(req, ['Admin'])` and call devOnlyGuard() in both handlers, or delete the route after migration.


### 2. Live-looking Supabase service-role key, Google OAuth secret and admin credentials written in unignored root docs

`secrets-committed-in-brain-and-log-docs`  
**Boundary:** Anyone who can read the project files → full database and Google Drive access

BRAIN.md and log.md in the repo root are not covered by .gitignore. They embed what appear to be real credentials: a Supabase service-role JWT, the Google OAuth client secret, a Google refresh token, the SETUP_SECRET value and the admin username and password. The app uses the service-role key for all data access, which bypasses RLS. Anyone who can read these files (repo collaborators, a leaked or forked repo, backups, iCloud sharing) could gain full access to customer data and money tables. They could also use the OAuth secret and refresh token for Drive access and the setup secret or admin password to take over the app. Secret values are deliberately not reproduced.

**Claimed root cause.** Operational notes containing real secret values were kept as repository-root documents, and .gitignore ignores only .env* and *.pem, so the docs ship with the source tree.

**Source trace**

1. `BRAIN.md:115` (entrypoint, Environment Variables (.env.local) section): SUPABASE_SERVICE_ROLE_KEY is documented with a full JWT-shaped value (Supabase service_role key). Further copies are at BRAIN.md:16-17 and log.md:409.
1. `BRAIN.md:122` (propagation, Google OAuth block): GOOGLE_OAUTH_CLIENT_SECRET holds a GOCSPX-prefixed value at line 122 and GOOGLE_OAUTH_REFRESH_TOKEN a refresh token at line 123. Admin username and password appear at lines 102-103.
1. `log.md:39` (propagation, Project setup notes): States the literal SETUP_SECRET value used by /api/setup.
1. `.gitignore:34` (sink, .env* rule): Only *.pem (line 25) and .env* (line 34) are ignored. BRAIN.md and log.md are not ignored and travel with any VCS push, archive or sync.

**Evidence**

- `lib/supabase-db.ts:186`: The service-role key (SUPABASE_SERVICE_ROLE_KEY) is the data-access credential, and RLS does not apply to it. The hunter cited line 129 here, which is unrelated; the env read is at line 186 (also lib/supabase.ts:16).
- `BRAIN.md:16`: The doc itself labels the value as the key in the file / working key, and line 115 shows it as SUPABASE_SERVICE_ROLE_KEY.
- `log.md:409`: A second copy of a JWT-shaped key, inside a pasted script.

**Exact blockers**

- No OS-enforced sandbox with memory limits on this host; target code was not executed.
- Cannot establish from source who can read this directory or whether it was ever pushed, shared or synced. The directory is not a git repository, so VCS history cannot be checked.
- Cannot tell whether the keys, OAuth secret and refresh token, SETUP_SECRET and admin password are still valid or have been rotated. Checking would require contacting live services, which is out of scope.

**Bounded local next step**

Run a read-only secret scan (for example grep for the eyJ JWT prefix and GOCSPX- over the tree and any VCS history or published copies). Confirm BRAIN.md and log.md are absent from deploy bundles, published repos and shared iCloud folders.

**Owner-observed deployment check**

Owner should check whether the repo or these files were ever pushed or shared. Rotate the Supabase service-role key, the Google OAuth client secret and refresh token, SETUP_SECRET and the admin password. Then remove the values from the docs, purge history if any, and add the docs to .gitignore.


### 3. POST /api/repayments lets any authenticated user mark any repayment Paid, replay it, or overwrite its status

`repayments-post-no-role-ownership-or-state-guard`  
**Boundary:** Any logged-in user → any customer's repayment and collection records

POST /api/repayments authenticates with getSession only, which checks the token, password version and block state but not role. It finds the repayment by ID across the whole Repayments table. It does no role check, no check that the loan belongs to the caller, and no check of the repayment's current Status. Any valid-token user, including a Guarantor, can mark another guarantor's or agent's customer repayment Paid. That appends a Collections row for the full amount with Agent ID set to the caller, and may set the loan Completed. Re-posting a Paid row appends duplicate Collections rows. Posting Pending or Not Paid on a Paid row reverts it to Pending, clears Paid Date, and leaves the earlier Collections row in place. STATUS_MAP does not accept Waived as an input status. However, the handler never reads the existing Status, so a Waived row (foreclosure weeks, which settlement reporting excludes) can be overwritten to Pending, Delayed or Paid. Paid-to-Pending, Delayed-to-Paid and Waived-to-other all follow from source.

**Claimed root cause.** The write handler does not apply the role and ownership scoping that the GET handler applies (NGF AGENT by Assigned Agent ID, Guarantor by Guarantor ID). It has no state-transition guard on Repayments.Status and no requireRole call. getSession alone is used where requireRole plus loan-ownership checks are needed.

**Source trace**

1. `app/api/repayments/route.ts:103` (entrypoint, POST handler): POST calls getSession (line 104), which does not check role, then reads repaymentId, status, paymentMode and paymentProof from the body (lines 105-106).
1. `app/api/repayments/route.ts:121` (propagation, POST handler): The repayment is found by ID in the full Repayments table. Nothing then checks the loan's Guarantor ID or Assigned Agent ID against the session, and nothing checks r.Status.
1. `app/api/repayments/route.ts:138` (propagation, POST handler): updateById overwrites Status, Paid Date, NGF Agent ID (set to session.userId), Payment Mode, Proof File ID and Notes for any repayment, including ones already Paid or Waived.
1. `app/api/repayments/route.ts:150` (sink, POST handler): appendRow adds a new Collections row on every Paid post, with Agent ID = session.userId and the full repayment Amount. Lines 164-171 set the Loan to Completed when every week is Paid.

**Evidence**

- `app/api/repayments/route.ts:28`: The GET handler scopes by role: NGF AGENT by Assigned Agent ID (lines 28-30) and Guarantor by Guarantor ID (lines 31-34). The POST has no equivalent.
- `lib/api.ts:6`: getSession validates the token, the password version and the blocked_until state only. It returns the session without checking role.
- `lib/api.ts:39`: requireRole exists but POST /api/repayments does not call it.
- `app/api/settlements/due/route.ts:51`: Settlement reporting treats Repayments.Status Paid with a non-empty NGF Agent ID as genuinely collected (lines 48-51, collector resolved at line 63), and excludes Waived weeks as foreclosure. Forged, replayed or overwritten rows therefore flow into settlement figures.

**Exact blockers**

- No target code was executed: no OS-enforced sandbox with memory limits on this host; target code was not executed.
- The intended policy is not visible in source: which roles are meant to record repayments, and whether Guarantors may record repayments only for their own loans. This is a business decision for the owner.
- Live database triggers or constraints cannot be seen from source. The service-role key bypasses RLS, but a trigger could still reject status regressions or duplicate Collections rows.

**Bounded local next step**

On a dummy Supabase project, create two dummy guarantors A and B and a loan with repayments for B. Call POST /api/repayments with A's bearer token, repaymentId on B's loan, status Paid and paymentMode Cash. Confirm the Repayment becomes Paid and a Collections row is appended with Agent ID = A. Replay the same call and confirm a second Collections row appears. Then post status 'Not Paid' for the same repayment and confirm it returns to Pending while both Collections rows remain. Optionally set a dummy repayment to Waived and confirm a Pending post overwrites it.

**Owner-observed deployment check**

The owner confirms which roles may record repayments and whether Guarantors may record only for their own loans. The owner also confirms whether any DB trigger or constraint on Repayments or Collections rejects status regressions or duplicate Collections rows, and checks production Collections for duplicate Repayment IDs.


### 4. QR step-up login can be completed by anyone holding the password, using the uid read from the preAuth token

`qr-stepup-factor-is-public-uid-in-preauth-token`  
**Boundary:** Password-only attacker → second login factor (when enabled)

When Settings qrlogin:<role> is on for a non-Admin role, login returns a preAuth JWT after the password check. verify-qr issues a full session if the submitted uid equals the uid claim of that preAuth token. The JWT payload is only signed, not encrypted, so the client can read it. The ID-card QR holds the same plain uid (plus username, role and card number), so the second factor can be derived from the first-factor response and adds no assurance. With remember=true, verify-qr also returns a 365-day trust token that skips the QR step on later logins.

**Claimed root cause.** verify-qr compares a client-supplied value against a non-secret claim from a token the client already holds, instead of verifying a server-held secret (random per-card token, or a challenge) delivered only via the physical card.

**Source trace**

1. `app/api/auth/login/route.ts:95` (entrypoint, POST /api/auth/login): After a valid password check and when qrlogin:<role> equals '1', createPreAuthToken(user['User ID']) is created and returned in the needQr response. The signed JWT payload carries uid in plain base64url.
1. `lib/auth.ts:65` (propagation, createPreAuthToken): Signs the JWT { t:'preauth', uid } with HS256 and a 10-minute expiry. The token is integrity-protected but not confidential.
1. `lib/idCard.ts:28` (propagation, idCardPayload (QR payload builder)): The ID-card QR encodes t, uid, un, role and card in plain JSON, with no server-held secret.
1. `app/api/auth/verify-qr/route.ts:31` (sink, POST /api/auth/verify-qr): The only factor check is uid !== userId, where userId is the preAuth claim. If it passes, createToken issues a full session (line 61) and, when remember is set, a 365-day trust token (line 72).

**Evidence**

- `app/api/auth/verify-qr/route.ts:31`: The only check is that the client-supplied uid equals the preAuth uid claim. No card number, nonce or other secret is verified. The route only additionally requires Users status Active.
- `lib/idCard.ts:28`: The QR content is a plain uid, username, role and card number. The QR scan reduces to the same uid that appears in the preAuth token.
- `lib/auth.ts:76`: The trust token is { t:'qrtrust', uid } with a 365-day expiry and is not bound to the password version. In the login route it is accepted by verifyTrustToken(trust) === user['User ID'] (login/route.ts line 86), so it persists across password changes.

**Exact blockers**

- Target code was not executed (no OS-enforced sandbox with memory limits on this host; target code was not executed), so the bypass was not observed at runtime.
- Whether qrlogin:<role> is enabled in the deployed Settings table is not source-visible. Admin is exempt in code and the feature is off unless the value is '1'.

**Bounded local next step**

With dummy users and a dummy JWT_SECRET of 32 or more characters, call the login handler with a valid dummy password for a non-Admin user whose qrlogin:<role> setting is '1'. Base64url-decode the preAuth payload, POST {preAuth, uid: payload.uid} to verify-qr, and confirm a session token is returned without any QR scan.

**Owner-observed deployment check**

The owner checks whether Settings rows qrlogin:Guarantor, qrlogin:NGF AGENT or qrlogin:Staff equal '1' in production. If none do, the step-up is inactive and the exposure does not apply. If any do, the step-up gives no protection against a password-only attacker.


### 5. File proxy lets any authenticated user read any stored customer document or any Drive file the OAuth account can access

`drive-proxy-any-session-reads-any-object-no-ownership-binding`  
**Boundary:** Any logged-in user → any customer's documents and any Drive file

GET /api/drive/:fileId requires only a valid session (getSession, no role check). An identifier of the form supabase:<bucket>/<path> for customer-docs, payment-proofs or profiles is downloaded with the service-role client and returned, with no check that the object belongs to the caller. Any other identifier goes to getFileBase64, which reads that Drive file ID with the OAuth Drive client and supportsAllDrives. A Guarantor or Agent who knows or guesses a path or ID could fetch other customers' ID, photo or payment-proof files, or other Drive files the account can read. Paths follow NGF-<guarantorCode>/<Customer_Name>/<prefix>.<ext>. The route returns 404 on any error, so it gives no existence oracle beyond success or failure.

**Claimed root cause.** The proxy and parseSupabaseProxyUrl check only the bucket allowlist. They do not tie the object to the caller's role, guarantor or customer, and they do not restrict Drive IDs to files the CRM created.

**Source trace**

1. `app/api/drive/[fileId]/route.ts:6` (entrypoint, GET): Route handler. It calls only getSession at line 8 and then reads fileId from the URL at line 9. Any role passes.
1. `lib/supabase.ts:65` (propagation, parseSupabaseProxyUrl): Checks the 'supabase:' prefix and that the bucket is one of the three buckets. The path is unconstrained and no ownership check is made.
1. `lib/supabase.ts:26` (sink, downloadFromSupabase): Service-role storage download at line 27. The route returns the bytes (route.ts lines 14-21). Non-Supabase IDs go to getFileBase64 (route.ts line 25; lib/drive.ts line 44) and are read through the OAuth Drive client.

**Evidence**

- `app/api/drive/[fileId]/route.ts:8`: Only getSession is called. There is no requireRole, owner lookup or scoping.
- `lib/drive.ts:44`: getFileBase64 fetches an arbitrary fileId with supportsAllDrives and no folder restriction.
- `lib/supabase.ts:61`: buildSupabaseProxyUrl shows the predictable bucket/path layout.
- `lib/supabase.ts:74`: getOrCreateFolderSupabase builds the NGF-<guarantorCode>/<customerName> path, so paths are guessable from names and codes.

**Exact blockers**

- No OS-enforced sandbox with memory limits on this host; target code was not executed
- Which object paths or Drive IDs a Guarantor or Agent can learn is not traced. List endpoints may expose document URLs only for scoped records.
- The OAuth account's Drive contents and scope, and the bucket public/private flags, are deployment facts that source cannot show.

**Bounded local next step**

Use a dummy Supabase storage fixture. Create two guarantors with one customer each and an uploaded document under customer-docs. Log in as guarantor A and request /api/drive/supabase:customer-docs/NGF-<B code>/<B customer>/<file>. A 200 with the bytes confirms the missing ownership binding. Repeat with a stubbed Drive client and an unrelated Drive ID.

**Owner-observed deployment check**

The owner checks which API responses expose document URLs or Drive IDs to Guarantor and Agent roles, whether the customer-docs bucket is public, and how much the OAuth account can read in Drive. The fix is to resolve the identifier to its owning lead or customer, enforce role and guarantor scope before download, and allow only Drive IDs recorded in the CRM.


### 6. Session tokens keep old role and survive account deactivation or role change for up to 24 hours

`session-role-and-status-not-rechecked-per-request`  
**Boundary:** Demoted or deactivated user → old privileges for up to 24 h

getSession verifies the JWT and re-reads only blocked_until, block_reason, password_hash and updated_at from users, then returns the role, name and guarantorCode from the token claims. It never checks users.status or users.role. The Admin-only PATCH /api/staff role change (non-guarantor path) updates Role, Username, Name, Email and Updated At but leaves the password hash unchanged unless a password is supplied. For tokens carrying a pv claim, the updated_at check is skipped. A demoted Admin or Staff user therefore keeps passing requireRole for the old role until the 24h token expires. Status is enforced only at login. Whether a deactivation path exists that leaves the hash and blocked_until unchanged (the guarantor edit RPC) is not visible in the repo.

**Claimed root cause.** Authorization state (role, status) is taken from a long-lived self-contained token rather than re-derived from the current users row; the only revocation hooks are the password-hash version (pv) and blocked_until.

**Source trace**

1. `lib/api.ts:10` (entrypoint, getSession): Bearer token is verified with verifyToken; the claims become the session.
1. `lib/api.ts:16` (propagation, getSession): DB re-read selects only blocked_until, block_reason, password_hash, updated_at; role and status are not selected.
1. `lib/api.ts:36` (propagation, getSession): Returns the token's session claims (role etc.) unchanged.
1. `app/api/staff/route.ts:230` (propagation, PATCH /api/staff): Role is updated in the DB via updateById; Password Hash is only changed if body.password is supplied, so pv still matches for the old token.
1. `lib/api.ts:41` (sink, requireRole): Role check runs against the stale token role.

**Evidence**

- `lib/api.ts:16`: The select list excludes status and role.
- `lib/api.ts:22`: With a pv claim, the updated_at check is skipped, so role/profile updates do not invalidate the token.
- `app/api/auth/login/route.ts:43`: Status !== Active is rejected only at login, not per request.

**Exact blockers**

- no OS-enforced sandbox with memory limits on this host; target code was not executed
- The update_guarantor_atomic RPC definition is not in the repo, so whether it writes users.status without changing password_hash or blocked_until is not visible.
- Whether the deployment accepts a 24h demotion/deactivation window is a policy decision; the role-demotion path is source-visible, but the deactivation path is unobserved.

**Bounded local next step**

With dummy data, issue a token for a dummy Admin, change that user's Role to Guarantor via the PATCH /api/staff handler without supplying a password, then call an Admin-only handler with the old token and confirm it is still accepted (200 instead of 403). Repeat with users.status set to Inactive directly in a dummy database.

**Owner-observed deployment check**

Owner checks the update_guarantor_atomic function body in the Supabase project to see whether it sets users.status, and whether any other flow deactivates a user without changing password_hash or blocked_until.


### 7. Permanent user block is stored as NULL blocked_until and is never enforced

`permanent-block-stores-null-blocked-until-not-enforced`  
**Boundary:** Admin's permanent block → not enforced

POST /api/staff/block (Admin only) with duration 'permanent' writes blocked_until=NULL, blocked_at=now, blocked_by and block_reason. Login and getSession enforce a block only when blocked_until is truthy and in the future, so NULL, the same value as an unblocked user, is never rejected. A user an admin believes is permanently blocked can still log in and keep using existing tokens. The API response says 'User blocked permanently'. Separately, durations such as '7d' and '30d' are parsed by parseInt(duration.replace('h','')) as 7 and 30 hours. A custom endDateTime is stored without validation. The GET handler and the org-hierarchy route also derive isBlocked from blocked_until alone.

**Claimed root cause.** The block state is encoded only as a future blocked_until timestamp. A permanent block uses NULL, which is indistinguishable from unblocked. Login and getSession do not consult blocked_at, block_reason or status.

**Source trace**

1. `app/api/staff/block/route.ts:50` (entrypoint, POST): Admin-only handler. duration === 'permanent' sets blockedUntil = null (lines 50-51). The check at line 61 explicitly allows null for 'permanent'.
1. `app/api/staff/block/route.ts:68` (propagation, POST): Updates users with blocked_at=now, blocked_until=null, blocked_by and block_reason. The status column is not changed.
1. `app/api/auth/login/route.ts:55` (propagation, POST login): Rejects only if Status !== 'Active' (line 43) or ('Blocked Until' truthy and > now). A NULL value passes, so password verification and token issue proceed.
1. `lib/api.ts:31` (sink, getSession): Re-reads blocked_until per request but rejects only if it is truthy and > now. Existing tokens of a permanently blocked user stay valid, and no other field is checked.

**Evidence**

- `app/api/staff/block/route.ts:102`: The response message 'User blocked permanently' shows the intended behavior is a lasting block.
- `components/pages/StaffPage.tsx:311`: The UI prompt offers 'permanent' (and 1h, 24h, 7d, 30d, custom) as durations.
- `app/api/staff/block/route.ts:55`: parseInt(duration.replace('h','')) turns '7d' into 7 hours and '30d' into 30 hours.
- `migrations/2026-10-14-add-user-blocking.sql:6`: The migration only adds a nullable TIMESTAMPTZ blocked_until, with no default, trigger or constraint that could encode a permanent block.
- `app/api/staff/block/route.ts:189`: The GET status handler also computes isBlocked from blocked_until only, so the admin UI would show a permanently blocked user as not blocked.
- `app/api/branches/org-hierarchy/route.ts:78`: The org-hierarchy route also computes isBlocked from 'Blocked Until' truthy and > now (again at line 99), so a NULL permanent block shows as not blocked.

**Exact blockers**

- No OS-enforced sandbox with memory limits on this host; target code was not executed, so the runtime result (a permanently blocked user still authenticates) is unobserved.
- The production DB state is not source-visible. Source shows only ADD COLUMN IF NOT EXISTS in the migrations, so any trigger or default rewriting NULL blocked_until in the live database cannot be ruled out.

**Bounded local next step**

With a dummy Supabase project or a mocked getSupabase, call the POST handler as a dummy Admin with duration 'permanent' for a dummy non-admin user. Then run the login handler for that user and call getSession with a token for that user. Expect both to succeed, which would show the block is not enforced. Also post '7d' and check that blocked_until is about 7 hours ahead. Fix: store a permanent block as 'infinity' or a far-future timestamp, or enforce blocked_at plus a permanent flag in login and getSession; parse d/h units properly; validate custom dates. Add a regression test that a permanent block makes both login and getSession reject.

**Owner-observed deployment check**

The owner checks, on a dummy account in a non-production project, that the users table has no trigger or default that rewrites NULL blocked_until, then performs the permanent block and confirms the dummy user can still log in.


### 8. Any NGF AGENT can submit or overwrite verification for any lead, regardless of assignment or lead status

`lead-submit-verification-missing-assigned-agent-check`  
**Boundary:** Any field agent → other agents' leads and customer PII

PATCH /api/leads/[leadId] with action submitVerification checks only requireRole(['NGF AGENT']). It then loads the lead by the URL leadId and never compares lead['Assigned Agent ID'] with the caller's Agent ID. It also does not check lead Status. An agent who knows another lead's ID can overwrite that lead's customer PII (name, phone, Aadhaar, PAN, bank account and IFSC), photo URLs and verification notes. The agent can also force Status to 'Verification Submitted' on a lead that was already Approved, Converted or Rejected. The Admin notification names the submitting agent. The list GET in app/api/leads/route.ts does scope agents to their assigned leads, so the item-level PATCH lacks the ownership rule that the list enforces.

**Claimed root cause.** submitVerification omits the ownership check (lead['Assigned Agent ID'] must equal the caller's Agent ID) and the lifecycle check (Status must be Agent Assigned or Reverification). Authorization is role-only, and the service-role database layer has no row-level policy backstop.

**Source trace**

1. `app/api/leads/[leadId]/route.ts:84` (entrypoint, PATCH submitVerification): Action dispatch; leadId comes from the URL path and the body is validated only for shape by submitVerificationSchema.
1. `app/api/leads/[leadId]/route.ts:92` (propagation, PATCH submitVerification): requireRole(['NGF AGENT']) followed by findRecord on the URL leadId (lines 93-94). No comparison of Assigned Agent ID with the session's agent, and no Status check.
1. `app/api/leads/[leadId]/route.ts:129` (sink, PATCH submitVerification): updateById('Leads', leadId, ...) overwrites the PII fields, photo URLs and Status on the arbitrary lead. Photo uploads (lines 116-121) and Drive folder creation (lines 105-112) also run before this.

**Evidence**

- `app/api/leads/route.ts:42`: The list GET scopes NGF AGENT callers to leads where Assigned Agent ID equals their Agent ID, which shows the intended ownership boundary.
- `app/api/leads/[leadId]/route.ts:134`: Status is set unconditionally to 'Verification Submitted'.
- `app/api/leads/[leadId]/route.ts:158`: The Admin notification uses session.name, so it attributes the overwrite to the submitting agent.

**Exact blockers**

- No OS-enforced sandbox with memory limits on this host; target code was not executed. The result comes from source reading only.
- The attacker needs another agent's leadId. The ID format and whether it is exposed to other agents (makeId('LEAD') at app/api/leads/route.ts:113, notifications, shared views) were not established. An attacker also needs an NGF AGENT account.
- No database trigger, RLS rule or other server-side check on the Leads table was observed. All access goes through the service-role key, so this is source-inferred only.

**Bounded local next step**

With dummy data in a local or staging stack, create lead L assigned to agent A and a lead in Approved status. Authenticate as a separate dummy agent B and send PATCH /api/leads/L with {action:'submitVerification', ...} and a dummy customerName. Expect success and L's fields and Status overwritten. Repeat on the Approved lead and expect Status reset to 'Verification Submitted'. After the fix, expect 403 when the Assigned Agent ID differs from B's Agent ID or when Status is not Agent Assigned or Reverification.

**Owner-observed deployment check**

Owner check: confirm that no database trigger or constraint on the Leads table blocks the update. Also confirm whether lead IDs are guessable or visible to other agents, for example through notifications or shared views.


### 9. NGF AGENT can read any agent's attendance and trip GPS history via agentId parameter

`agent-attendance-trips-get-agentid-idor`  
**Boundary:** Any field agent → other agents' GPS history

GET /api/agent/attendance and GET /api/agent/trips allow the roles NGF AGENT, Admin and Staff. A client-supplied agentId query parameter overrides the caller's own Agent ID, and the code has no ownership check for the NGF AGENT role. A low-privilege agent who knows another agent's Agent ID could read that agent's attendance rows (including latitude and longitude) and trip rows (start and end coordinates, distances, lead IDs).

**Claimed root cause.** The target agent is computed as agentId || agent?.['Agent ID'] and is never bound to the session when the caller's role is NGF AGENT. The agentId override should be honoured only for Admin and Staff.

**Source trace**

1. `app/api/agent/attendance/route.ts:61` (entrypoint, GET): requireRole allows NGF AGENT, Admin and Staff. The agentId query parameter is read at line 63.
1. `app/api/agent/attendance/route.ts:70` (propagation, GET): targetAgentId = agentId || own Agent ID. The client value wins, and the only role check is the 'Agent not found' error at line 68, which applies to a missing own record and not to the override.
1. `app/api/agent/attendance/route.ts:74` (propagation, GET): AgentAttendance rows are filtered by the client-chosen Agent ID and returned at line 80 with their full contents, including Latitude and Longitude.
1. `app/api/agent/trips/route.ts:75` (propagation, GET): requireRole allows NGF AGENT, Admin and Staff. The agentId query parameter is read at line 78.
1. `app/api/agent/trips/route.ts:84` (propagation, GET): targetAgentId = agentId || own Agent ID. The client value wins.
1. `app/api/agent/trips/route.ts:88` (sink, GET): AgentTrips rows are filtered by the client-chosen Agent ID and returned at line 94.

**Evidence**

- `app/api/agent/attendance/route.ts:70`: The override is applied without a role or ownership check. The only other control on the path is the session-derived own-agent lookup at lines 66-68, which does not constrain agentId.
- `app/api/agent/trips/route.ts:84`: The same override with no role or ownership check.
- `app/api/agent/location/route.ts:88`: Contrast: the sibling location GET is restricted to Admin and Staff, so agent location data is intended to be hidden from agents.

**Exact blockers**

- No OS-enforced sandbox with memory limits on this host; target code was not executed, so the result is derived from source only.
- A decisive runtime fact is unobserved: whether an NGF AGENT can learn another agent's Agent ID, which is needed to exploit this. The source does not show where IDs are exposed to agents, for example through lead assignment data.

**Bounded local next step**

Use dummy data only. Create two Agents rows (A and B) with users, plus AgentAttendance and AgentTrips rows for each. Authenticate as agent A and call GET /api/agent/attendance?agentId=<B's Agent ID> and GET /api/agent/trips?agentId=<B's Agent ID>. If B's rows are returned, the issue is confirmed. After a fix, expect a 403 or only A's own rows. Also check which agent-accessible endpoints (leads, profile) expose other agents' Agent IDs.

**Owner-observed deployment check**

Not required beyond confirming that the deployed build matches this source.


### 10. Collection sheet returns all customers' contact and balance data to any authenticated non-guarantor role

`collection-sheet-get-missing-role-and-agent-scope`  
**Boundary:** Any non-guarantor role → every customer's name, phone, balance

GET /api/collection-sheet calls only getSession. The Guarantor role is bound to its own Guarantor ID from the session. Every other role, including NGF AGENT, skips that branch. With no guarantorId the customer list stays unfiltered. A guarantorId query parameter lets any non-Guarantor role pick any guarantor's sheet. The response returns name, phone, place, outstanding balance, loan code (last 4 digits of the Loan ID) and guarantor for every customer with an active loan and unpaid repayments. /api/customers restricts NGF AGENT to customers on assigned loans, so the collection sheet is inconsistent with it. The sheet is a role-wide view of the whole book, so product intent for agents is unconfirmed.

**Claimed root cause.** No requireRole check and no NGF AGENT scoping in the collection-sheet GET handler. The customer list is filtered only when a guarantorId is resolved (Guarantor session, or a client-supplied guarantorId parameter).

**Source trace**

1. `app/api/collection-sheet/route.ts:10` (entrypoint, GET): getSession only; no requireRole or role check on viewing
1. `app/api/collection-sheet/route.ts:35` (propagation, GET): Only the Guarantor role is forced to its own Guarantor ID. Other roles take the client guarantorId (line 40) or none.
1. `app/api/collection-sheet/route.ts:54` (propagation, GET): scoped = all customers unless guarantorId is non-empty; there is no agent branch
1. `app/api/collection-sheet/route.ts:104` (sink, GET): ok() returns rows with name, phone, place, balance, loan code and guarantor for the whole scoped set

**Evidence**

- `app/api/collection-sheet/route.ts:23`: Only the PDF download window distinguishes Admin and Staff. Viewing has no role restriction (comment at lines 16-17: on-screen viewing allowed anytime).
- `app/api/customers/route.ts:39`: Contrast: the NGF AGENT branch limits customers to those on loans assigned to the agent, so the two endpoints disagree on agent scope.

**Exact blockers**

- No OS-enforced sandbox with memory limits on this host; target code was not executed, so the result is derived from source only
- Whether product intent allows NGF AGENT (and other non-Admin roles) to see the all-customer collection sheet is not documented in source and needs owner confirmation

**Bounded local next step**

With dummy data, call the GET handler with a session whose role is NGF AGENT, no assigned loans and no guarantorId. Expect rows for all dummy customers that have an active loan. Repeat with a guarantorId of another dummy guarantor and expect that guarantor's rows. After a fix, expect a 403 or an agent-scoped result.

**Owner-observed deployment check**

Owner to confirm whether NGF AGENT users are meant to see the all-customer collection sheet. Also confirm which user accounts hold the NGF AGENT or Staff roles in production.


### 11. Dashboard API returns capital, investor and global collection totals to Guarantor and Agent roles

`dashboard-metrics-expose-capital-and-global-aggregates-to-all-roles`  
**Boundary:** Guarantor or agent → capital, investor and global totals

GET /api/dashboard authenticates with getSession only. It computes totalCapital, investorMoney, totalInterest and availableCapital from the whole Capital and Loans tables. It computes monthCollected, weekCollected, recollectionRate, collectedCount, pendingCount and activeCustomers from all repayments and customers. All of these go into the shared metrics object returned to any authenticated role, including Guarantor and NGF AGENT. Only loan counts, totalLoanAmount, thisWeekCollection and leads are role-scoped. The Admin-only cards are hidden in the browser by an isAdmin check in Dashboard.tsx, but the server response is not filtered. The sibling financial-analytics endpoint returns 403 to non-Admin callers, so this is inconsistent with the apparent intended policy. Source re-read confirms the trace. Nothing was executed, and whether the business intends guarantors and agents to see these figures is unconfirmed.

**Claimed root cause.** Role scoping is applied only to some metrics. Admin-grade financial aggregates are computed unconditionally from unscoped tables and returned in the shared metrics object. The server does not gate them by role, and only the client hides them.

**Source trace**

1. `app/api/dashboard/route.ts:9` (entrypoint, GET /api/dashboard): The handler calls getSession only. There is no requireRole and no role check before the financial fields are built.
1. `app/api/dashboard/route.ts:128` (propagation, capital aggregates): totalCapital, investorMoney, totalInterest, totalPrincipal, totalCollected and availableCapital (lines 128-133) are computed from the full Capital, Loans and Repayments tables with no role branch.
1. `app/api/dashboard/route.ts:114` (propagation, global collection aggregates): monthCollected (114), weekCollected (106) and recollectionRate with collectedCount and pendingCount (119-124) are computed from all repayments, not from myLoans.
1. `app/api/dashboard/route.ts:148` (sink, ok({metrics})): The metrics object returned to every authenticated role includes activeCustomers (154), monthCollected, weekCollected, totalCapital, investorMoney, totalInterest, availableCapital, recollectionRate, collectedCount and pendingCount (156-169).

**Evidence**

- `app/api/dashboard/route.ts:154`: activeCustomers counts all Active customers with no role scoping.
- `components/pages/Dashboard.tsx:205`: const isAdmin = session.role === 'Admin' is the only restriction on showing the capital cards. It runs in the browser, and metricCards is chosen by role at line 406.
- `app/api/financial-analytics/route.ts:11`: The sibling endpoint returns 403 for non-Admin callers, which shows the intended policy for financial aggregates.

**Exact blockers**

- No OS-enforced sandbox with memory limits on this host; target code was not executed, so the actual JSON returned to a Guarantor or Agent token was not observed.
- Whether the business intends capital, investor and global collection totals to be visible to Guarantor and Agent users is a product-owner decision. The source shows only the client-side hiding and the sibling endpoint's Admin check.

**Bounded local next step**

In an isolated environment with a dummy database and a dummy Guarantor session, call the GET handler. Check whether metrics contains totalCapital, investorMoney, totalInterest, availableCapital, monthCollected, weekCollected and activeCustomers computed from all dummy rows. Repeat with a dummy NGF AGENT session. Do not use production data.

**Owner-observed deployment check**

The owner confirms whether capital and investor totals and global collection figures are meant to be Admin-only. The owner then checks whether any non-Admin user accounts exist in production.


### 12. Notifications list returns user-targeted notifications to every user with the same role

`notifications-get-role-match-exposes-per-user-notifications`  
**Boundary:** Guarantor or agent → peers' lead decisions

GET /api/notifications returns rows where User ID equals the caller OR Role equals the caller's role. notifyUser writes the target user's role onto user-targeted notifications, so those rows also match every other user of that role. Any Guarantor can read other guarantors' 'Lead Approved' and 'Lead Rejected' notifications, which contain the customer name and the loan decision. Any NGF AGENT can read other agents' 'Lead Assigned' notifications naming the customer under verification. No server-side control on the path (session check only, service-role reads, JS-side filter) restricts the Role branch to broadcast rows.

**Claimed root cause.** The recipient filter treats the Role column as a broadcast selector, but user-targeted notifications also populate Role with the target's role and carry a non-null User ID. The role branch has no 'User ID is null' condition, so targeted rows are exposed to every peer of that role.

**Source trace**

1. `app/api/notifications/route.ts:11` (entrypoint, GET /api/notifications): After getSession (line 6) and a whole-table readTable (line 10), the filter `n['User ID'] === session.userId || n['Role'] === session.role` is applied with no check that the row is a broadcast row.
1. `lib/notifications.ts:4` (propagation, notifyUser): A user-targeted row is created with its User ID (line 6) and the target's Role (line 7), so the Role branch also matches it for peers.
1. `app/api/leads/[leadId]/route.ts:190` (propagation, approveLoan branch): A Guarantor-targeted notification 'Lead Approved' is created with message '<Customer Name> has been approved for a loan.' (rejection analogue at line 199; agent assignment at line 80).
1. `app/api/notifications/route.ts:13` (sink, GET response mapping): The response mapping (lines 13-17) returns userId, title, message and entityId of the matched rows to the caller.

**Evidence**

- `app/api/notifications/route.ts:11`: OR filter on Role without a null User ID condition.
- `lib/notifications.ts:7`: notifyUser sets both User ID (line 6) and Role (line 7); notifyRole (line 20) sets User ID to null, the only genuine broadcast form.
- `app/api/leads/[leadId]/route.ts:80`: Agent-assignment notification via notifyUser with the agent's role and the customer name.
- `app/api/leads/[leadId]/route.ts:199`: Guarantor rejection notification with the customer name.
- `supabase_schema.sql:392`: Repo schema declares notifications.user_id NOT NULL, which conflicts with notifyRole writing null; the deployed definition is not known. This does not affect notifyUser rows, which always carry a non-null User ID and a Role.

**Exact blockers**

- No OS-enforced sandbox with memory limits on this host; target code was not executed, so the live row shape in the deployed Notifications table was not observed.
- The deployed notifications table definition (whether user_id is nullable and whether notifyUser rows persist both user_id and role) must be observed by the owner.

**Bounded local next step**

With a dummy-data harness that stubs readTable('Notifications') with two rows (one notifyUser-shaped with User ID=G1 and Role='Guarantor', one broadcast row with null User ID), call the GET handler with a session for dummy guarantor G2 (Role='Guarantor'). Expect the G1 row to be returned. Then change the filter to `n['User ID'] ? n['User ID']===session.userId : n['Role']===session.role` and expect the G1 row to be excluded.

**Owner-observed deployment check**

Owner check: in the live Supabase notifications table, confirm that rows created by notifyUser carry a non-null user_id plus a role value, and whether user_id is nullable. Fix by applying the Role match only when User ID is null or empty.


### 13. Auth rate limiter keys on client-controllable X-Forwarded-For, enabling login throttle bypass

`rate-limit-key-trusts-client-x-forwarded-for`  
**Boundary:** Unauthenticated attacker → unlimited password guesses

authRateLimit buckets by the first X-Forwarded-For value, falling back to X-Real-IP, then a shared 'unknown' bucket. If the reverse proxy appends to the header (nginx $proxy_add_x_forwarded_for) rather than overwriting it, a client can send a different value on each request and never exceed the 10/min limit. The login handler has no per-account failure counter or automatic lockout. Failed passwords only write an audit entry, and 'Blocked Until' is only read, never set on failure. So password guessing against known usernames, names or emails is throttled only by this IP key. If no proxy sets the header, all clients share one bucket and can lock each other out of login. Whether production overwrites the header is not visible in the repository.

**Claimed root cause.** lib/rate-limiter.ts getKey() uses the leftmost x-forwarded-for entry with no trusted-proxy or hop-count handling, and login adds no account-level failure counter.

**Source trace**

1. `app/api/auth/login/route.ts:14` (entrypoint, POST /api/auth/login): authRateLimit(req) is the only brute-force control before credential checking; an unauthenticated caller reaches it.
1. `lib/rate-limiter.ts:11` (propagation, getKey): The key is the leftmost x-forwarded-for entry, then x-real-ip, else 'unknown' (function spans lines 10-15). The rateLimit store lookup at lines 26-36 uses this key.
1. `app/api/auth/login/route.ts:66` (sink, verifyPassword): Password guesses against the found user reach verifyPassword. Rotating the key gives a fresh 10/min bucket each time, so attempts are unbounded.

**Evidence**

- `DEPLOY.md:44`: Deployment says only 'Set up Nginx reverse proxy to port 3000'. No header-overwrite configuration is shown.
- `lib/audit.ts:37`: extractClientInfo reuses the same unvalidated x-forwarded-for derivation for audit IPs (hardening note).
- `lib/rate-limiter.ts:8`: The limiter store is an in-memory Map, so multiple instances multiply the effective limit.

**Exact blockers**

- Whether the production reverse proxy overwrites or appends x-forwarded-for is not source-visible (it also depends on the hosting platform).
- No OS-enforced sandbox with memory limits on this host; target code was not executed.

**Bounded local next step**

In a sandboxed harness with dummy NextRequest objects, call authRateLimit 11 times with a distinct x-forwarded-for value each time and assert none returns 429. Then call it 11 times with the same value and assert the 11th returns 429.

**Owner-observed deployment check**

The owner sends two requests through the production proxy with a forged X-Forwarded-For header and inspects what the app receives, or reviews the proxy config, to confirm the header is overwritten with $remote_addr (or that the platform strips client values). Add a per-account failure counter or lockout regardless.


### 14. Renewal approval trusts a client-supplied customer id in lead notes, with no ownership or eligibility check

`renewal-lead-source-customer-from-notes-not-bound-to-guarantor-or-eligibility`  
**Boundary:** Guarantor → renewal loan on another guarantor's customer

A Guarantor can submit a lead with loanProduct 'RENEWAL' and notes 'Renewal request - Customer ID: <any customer id>'. When an Admin or Staff user approves it, approveRenewal looks up that customer from the notes. It copies the customer's latest loan terms into a new Active loan with a repayment schedule, sets the customer's Active Loan ID, and marks the lead Converted. The server does not check that the customer belongs to the submitting guarantor, that the previous loan is Completed, or that no loan is already active. The renewal-eligibility rules exist only in browser code. The new loan is attributed to the customer's own guarantor. A human Admin or Staff approval is the only gate. Whether that reviewer can see the notes-bound customer is not established from source.

**Claimed root cause.** The customer binding for a renewal is stored in free-text Notes that the client controls. Neither lead creation nor approveRenewal validates ownership or eligibility. Eligibility is enforced only in the client.

**Source trace**

1. `app/api/leads/route.ts:76` (entrypoint, POST /api/leads): A Guarantor session is accepted. guarantorId is forced to the caller's own guarantor, but nothing validates the customer referenced in the notes.
1. `app/api/leads/route.ts:160` (propagation, appendRow Leads (Loan Product, Notes at line 175)): Loan Product and Notes are stored verbatim from the request body, so the Customer ID reference is attacker-controlled.
1. `app/api/leads/[leadId]/route.ts:182` (propagation, adminReview Approve Loan (Admin or Staff)): Dispatches to approveRenewal when Loan Product === 'RENEWAL'.
1. `app/api/leads/[leadId]/route.ts:414` (sink, approveRenewal): Regex-extracts Customer ID from Notes and loads any matching customer, with a Phone+Name fallback taken from the lead. It then appends a new Active loan and Repayments and sets Active Loan ID, with no guarantor-match, active-loan or completed-loan check.

**Evidence**

- `components/pages/RenewalModal.tsx:72`: Only the client builds the notes string. The evaluateRenewal eligibility check also runs only in the browser.
- `lib/validation.ts:65`: createLeadSchema has no renewal-specific constraint. loanProduct is any non-empty string and notes is any optional string.
- `app/api/leads/[leadId]/route.ts:417`: The only check is that a customer exists. The Phone+Name fallback is also derived from client-controlled lead fields.

**Exact blockers**

- No OS-enforced sandbox with memory limits on this host; target code was not executed.
- Impact depends on whether Admin or Staff review in the UI shows the Notes field and the notes-bound customer. That UI behaviour is not confirmed from the API source alone. If it is not shown, a mismatch is easy to miss at the human approval step.

**Bounded local next step**

In a dummy dataset with two guarantors (A and B), each with one customer, post a RENEWAL lead as guarantor A with notes naming guarantor B's customer id. Approve it as Admin. Assert that a loan is created only if the customer belongs to A, has a Completed previous loan, and has no Active loan. Based on source, the loan is created today.

**Owner-observed deployment check**

Owner check: in the lead review UI, confirm whether the Notes field and the target customer are shown to the approving Admin or Staff before they click Approve Loan.


### 15. Stored XSS in guarantor commission receipt print window via customer name

`commissions-receipt-unescaped-customer-name-document-write`  
**Boundary:** Field agent → script in a guarantor's browser session

buildReceiptHtml in CommissionsPage inserts loan customerName and session.name into an HTML template without escaping, then document.write()s it into a window.open('') popup that shares the app origin. A customer name containing markup, planted by an assigned NGF AGENT through submitVerification (and carried into Customers.Name on loan approval), would execute script in the Guarantor's browser when they download or print a payout receipt. The script could read localStorage ngf_token and call the API as that Guarantor.

**Claimed root cause.** Unescaped template interpolation of server-stored, lower-privilege-writable text into HTML passed to document.write in a same-origin about:blank window. CommissionsPage has no esc() helper, unlike CollectionPage, which defines one.

**Source trace**

1. `app/api/leads/[leadId]/route.ts:135` (entrypoint, PATCH submitVerification): Assigned agent supplies body.customerName with no markup filtering. It is stored as Leads 'Customer Name'.
1. `app/api/leads/[leadId]/route.ts:338` (propagation, approveLoan): Customer 'Name' is created from lead['Customer Name'].
1. `app/api/loans/route.ts:48` (propagation, GET loans): customerName is returned from the Customers 'Name' field to the client.
1. `components/pages/CommissionsPage.tsx:114` (propagation, buildReceiptHtml): `<td>${l.customerName}</td>` is interpolated raw into the HTML string. session.name is likewise interpolated raw at line 148.
1. `components/pages/CommissionsPage.tsx:191` (sink, downloadReceipt): w.document.write(html) into window.open('', '_blank'). The popup inherits the opener's origin.

**Evidence**

- `components/pages/CommissionsPage.tsx:114`: No escaping on customerName in the receipt template.
- `components/pages/CollectionPage.tsx:594`: Sibling print builder defines esc(), so the control exists elsewhere but is missing here. Note it escapes only & < >.
- `next.config.ts:3`: No CSP or security headers configured in the Next config.

**Exact blockers**

- No browser execution: no OS-enforced sandbox with memory limits on this host; target code was not executed.
- Whether the deployed origin or proxy sends a CSP that blocks inline event handlers in the popup was not observed. The source sets none.
- Browser behavior for a window.open('') popup inheriting the opener origin was not observed.

**Bounded local next step**

In a local dummy-data instance, as a dummy assigned agent, submit verification with customerName set to `<img src=x onerror=alert(document.domain)>`. Approve the lead as Admin, log in as the dummy Guarantor, open Commissions, request a payout and click download receipt. Expected: the handler fires in the popup. Fix by HTML-escaping all interpolated values (including quotes) or building the receipt with DOM APIs.

**Owner-observed deployment check**

Owner confirms that no CSP or other response header on the production origin blocks inline event handlers or script.


### 16. Stored XSS in ID-card print window via unvalidated profile photo value

`idcard-photo-src-unescaped-document-write`  
**Boundary:** Staff → script in another user's (e.g. Admin's) browser session

POST /api/profile stores body.photo verbatim as Profiles.Photo. Any Admin or Staff caller can target another user by passing userId (lines 60-61). GET /api/profile returns the stored value to the owner, and MyIdCardPage puts it in state and passes it to buildIdCardHtml as photoDataUrl. buildIdCardHtml interpolates it unescaped into `<img src="...">`. The page then calls document.write on that HTML in a window.open('') popup that shares the app origin. A Staff user could store a value such as `x" onerror="...` on an Admin's profile, and the script would run in the Admin's session when the Admin clicks Print ID Card. The popup shares the app origin, where the bearer token is kept in localStorage (per the architecture notes). A Guarantor or Agent cannot write another user's profile, because requireRole blocks them. Self-stored payloads are self-XSS only.

**Claimed root cause.** The server accepts an arbitrary string for Profiles.Photo with no data:image/ or same-origin check. The client template inserts it into a double-quoted attribute without attribute escaping, because esc() at lib/idCard.ts:45 escapes only & < > and not quotes.

**Source trace**

1. `app/api/profile/route.ts:75` (entrypoint, POST /api/profile): photoUrl = body.photo is stored as Profiles.Photo with no validation. body.userId lets Admin or Staff target other users (lines 60-61, requireRole(['Admin','Staff'])). The photoFile branch at lines 76-83 only replaces the value when a file is also supplied.
1. `components/pages/MyIdCardPage.tsx:47` (propagation, load): setPhoto(j.data.photo) loads the stored value from GET /api/profile (the caller's own profile). printCard passes it as photoDataUrl at line 78.
1. `lib/idCard.ts:110` (propagation, buildIdCardHtml): `<img src="${user.photoDataUrl}" class="photo-img" />` is built with no escaping or scheme check.
1. `components/pages/MyIdCardPage.tsx:83` (sink, printCard): w.document.write(buildIdCardHtml(...)) writes the HTML into a window.open('', '_blank') popup that inherits the app origin.

**Evidence**

- `lib/idCard.ts:45`: esc() replaces only & < > and not double quotes. It is not applied to the photo at line 110.
- `lib/idCard.ts:110`: Raw attribute interpolation of user.photoDataUrl.
- `app/api/profile/route.ts:75`: body.photo is stored with no type, prefix or length validation.
- `components/pages/MyIdCardPage.tsx:83`: document.write of the generated HTML into a same-origin popup.

**Exact blockers**

- No browser execution: no OS-enforced sandbox with memory limits on this host; target code was not executed.
- Whether Staff is a lower-trust principal than Admin is a policy decision. The route only enforces requireRole(['Admin','Staff']), so Staff can write any user's profile.
- Whether a deployed CSP or header blocks inline event handlers in the popup. next.config.ts sets none in source, but the host or proxy was not observed.

**Bounded local next step**

Use dummy accounts in a disposable local environment. As dummy Staff, POST /api/profile with userId set to the dummy Admin's id and photo set to `x" onerror="alert(document.domain)`. Log in as the dummy Admin, open My ID Card and click Print ID Card. Expected: the onerror handler fires in the popup and document.domain is the app origin. Then check whether the popup can read the ngf_token entry in localStorage.

**Owner-observed deployment check**

The owner confirms that Staff is meant to be lower-trust than Admin, and that no CSP or proxy header blocks inline handlers on the deployed host. The fix is to accept only data:image/(png|jpeg|webp);base64 or /api/drive/ URLs on the server and in the client, and to attribute-escape (including quotes) in buildIdCardHtml.


### 17. Google Drive query injection through customer name in getOrCreateFolder

`drive-folder-query-unescaped-customer-name`  
**Boundary:** Lead submitter → documents filed in another customer's Drive folder

getLeadDocFolder passes the client-supplied customerName to getOrCreateFolder, which builds the Drive files.list q string with name='${name}' and no escaping of quotes or backslashes. A name such as `x' or mimeType='application/vnd.google-apps.folder` changes the boolean structure. Because 'and' binds tighter than 'or', the query becomes (parent and name=x) or (mimeType=folder and trashed=false). It can then match any folder visible to the OAuth account, and the first match is returned as the upload parent. Lead photos are uploaded into that folder, so KYC documents can land in another customer's folder. The route swallows errors, so a malformed name only fails silently.

**Claimed root cause.** String concatenation of customerName into the Drive files.list q parameter without escaping backslash and single-quote characters. The server does not restrict customerName characters (createLeadSchema only requires min(1)).

**Source trace**

1. `app/api/leads/route.ts:121` (entrypoint, POST /api/leads): body.customerName is passed to getLeadDocFolder when any photo field is present. The entrypoint is an authenticated lead submission. customerName is validated only as a non-empty string (lib/validation.ts:53).
1. `lib/drive.ts:72` (propagation, getLeadDocFolder): customerName is forwarded unchanged as the folder name to getOrCreateFolder under the NGF-<code> parent folder.
1. `lib/drive.ts:16` (sink, getOrCreateFolder): drive.files.list q is built as `'${parentId}' in parents and name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`. The first returned file id (line 21) becomes the upload parent in saveFile.

**Evidence**

- `lib/validation.ts:53`: createLeadSchema.customerName is z.string().min(1) with no character restriction.
- `lib/drive.ts:16`: Unescaped interpolation of name into the Drive q string. No escaping or allowlist exists anywhere on the path.
- `app/api/leads/route.ts:134`: The catch block swallows Drive errors. A malformed query fails silently and is not an observable control.

**Exact blockers**

- Google Drive q parser precedence for 'or' versus 'and' and its handling of the injected clause is provider-side behavior and was not observed.
- Impact depends on the production OAuth Drive account holding other folders, and on PHOTO_ROOT_FOLDER_ID being a Drive folder rather than Supabase-only mode.
- No OS-enforced sandbox with memory limits on this host; target code was not executed.

**Bounded local next step**

With a mocked googleapis Drive client (no network, dummy IDs), call getOrCreateFolder('PARENT', "x' or mimeType='application/vnd.google-apps.folder") and assert on the captured q string. Expected: `'PARENT' in parents and name='x' or mimeType='application/vnd.google-apps.folder' and mimeType='application/vnd.google-apps.folder' and trashed=false`. Separately, confirm in Google's documented Drive search grammar that 'and' has higher precedence than 'or'.

**Owner-observed deployment check**

Owner, on a test Drive account with two dummy folders, submits a lead with the crafted customerName and a photo. The owner then checks whether the photo landed in a folder other than NGF-<code>/<name>. Owner also confirms that PHOTO_ROOT_FOLDER_ID points at a Drive folder in production.


### 18. Supabase Storage object key built from raw client file name or type with upsert enabled

`storage-object-key-from-unsanitized-client-filename`  
**Boundary:** Any logged-in user → overwrite other storage objects

POST /api/repayments (session required, any role) uploads paymentProof to the payment-proofs bucket under `${Loan ID}/${ts}_${paymentProof.fileName}`. POST /api/profile uploads to the profiles bucket under `${userId}/profile.${body.photoFileType}`. fileName and photoFileType are raw client strings, and photoFileType is also used as the MIME type. uploadToSupabase (service-role client) calls upload with upsert:true and the client contentType. It does no segment, extension, size or MIME validation. If Storage accepts `..` or extra `/` segments in the key, a low-privilege caller could overwrite other loans' proof objects or other users' profile photos in the same bucket. Without that, the confirmed issues are only the missing size and type validation and the arbitrary stored contentType. The customer-docs variant in the same file sanitizes its path components, so the missing validation here is inconsistent with the rest of the code.

**Claimed root cause.** Client-controlled path material is concatenated into the storage key without a basename, character allowlist or extension allowlist, and uploads use upsert:true so existing keys are overwritten.

**Source trace**

1. `app/api/repayments/route.ts:129` (entrypoint, POST /api/repayments): paymentProof.fileName from the JSON body is concatenated into the key after `${r['Loan ID']}/${ts}_`. The route only calls getSession, with no role check and no validation of fileName, mimeType or size.
1. `lib/drive.ts:92` (propagation, saveFileSupabase): Passes bucket, path, base64 data and mimeType unchanged to uploadToSupabase.
1. `lib/supabase.ts:44` (sink, uploadToSupabase): getSupabase().storage.from(bucket).upload(path, buffer, { contentType: mimeType, upsert: true }) with the service-role client, so RLS does not apply and the raw key is used.

**Evidence**

- `app/api/profile/route.ts:79`: Key `${userId}/profile.${body.photoFileType || 'jpg'}`; line 80 uses the same unvalidated value as contentType. Any authenticated user can reach this for their own userId.
- `lib/supabase.ts:79`: getOrCreateFolderSupabase sanitizes guarantor and customer path components for customer-docs, so the payment-proofs and profiles paths are the unsanitized ones.

**Exact blockers**

- Whether Supabase Storage rejects or normalizes `..` and extra `/` segments in object keys is provider behavior that source cannot show. No OS-enforced sandbox with memory limits on this host; target code was not executed.
- The forced prefixes `${Loan ID}/${ts}_` and `${userId}/profile.` limit any overwrite to keys reachable through traversal, and the timestamp makes exact-name collisions hard. The photoFileType path (`../../OTHER/profile.jpg` style) is more direct. Neither was observed at runtime.
- Bucket public/private flag, allowed MIME types and size limit are Supabase dashboard settings and are not in the repo.

**Bounded local next step**

Against a local Supabase Storage test project with dummy buckets and objects, call the upload with fileName `../OTHERLOAN/x.jpg` and photoFileType `../OTHERUSER/profile.jpg` as a dummy low-privilege user. Then list the bucket to see whether the key is rejected, normalized or written outside the intended prefix, and whether an existing dummy object is overwritten.

**Owner-observed deployment check**

Owner checks the payment-proofs and profiles bucket settings in the Supabase dashboard (public/private, allowed MIME types, file size limit) and the Storage version's key validation. Fix: use only a server-generated name such as `${ts}_${randomUUID()}.${ext}` with ext from a MIME allowlist, reject path separators, use upsert:false, and enforce a size cap.


### 19. RLS not enabled on agent_trips and agent_attendance; branch_staff_roles and guarantor_branches undefined in repo SQL

`rls-not-enabled-on-agent-trips-attendance-and-branch-tables`  
**Boundary:** Holder of the public Supabase key → agent and branch tables

supabase_schema.sql enables RLS with service-role-only policies on 22 tables (lines 446-467), but agent_trips (line 536, GPS start/end coordinates) and agent_attendance (line 558, latitude/longitude) are created with no ENABLE ROW LEVEL SECURITY anywhere in the repo SQL (grep of all *.sql finds only CREATE TABLE and CREATE INDEX statements for them). branch_staff_roles and guarantor_branches are mapped in lib/supabase-db.ts TABLE_MAP but have no CREATE TABLE or RLS statement in any repo SQL file. The app uses the service-role key, so RLS never affects it and the gap is hidden. If RLS is off in the live project and default anon/authenticated grants exist, the public anon key could read or modify these tables through PostgREST. The anon key is not in the repo.

**Claimed root cause.** Tables added after the RLS block of supabase_schema.sql were created without RLS enablement, and some tables were created out-of-band without repo DDL.

**Source trace**

1. `supabase_schema.sql:536` (entrypoint, agent_trips table): CREATE TABLE IF NOT EXISTS agent_trips with GPS columns; no ENABLE ROW LEVEL SECURITY in any repo SQL file.
1. `supabase_schema.sql:558` (propagation, agent_attendance table): CREATE TABLE IF NOT EXISTS agent_attendance with latitude/longitude; no RLS enablement.
1. `lib/supabase-db.ts:36` (sink, TABLE_MAP): TABLE_MAP maps AgentTrips, AgentAttendance, BranchStaffRoles and GuarantorBranches (lines 36-39) to tables not covered by any RLS statement in the repo.

**Evidence**

- `supabase_schema.sql:446`: RLS enablement list (lines 446-467) covers only the original 22 tables; the agent tables are not included.
- `migrations/2026-10-16-add-password-reset-otps.sql:35`: The newest migration enables RLS with no policies, showing the intended pattern that the agent tables lack.

**Exact blockers**

- Live RLS and grant state of the Supabase project is not source-visible (RLS may have been enabled out-of-band, or Supabase's default for tables created via the dashboard may apply).
- The anon key is not in the repo and the app does not use it, so an attacker must obtain it; it is normally public in the client of any Supabase-fronted app, but this app does not expose it.
- no OS-enforced sandbox with memory limits on this host; target code was not executed

**Bounded local next step**

Grep all *.sql for ENABLE ROW LEVEL SECURITY per table and diff against TABLE_MAP values in lib/supabase-db.ts; already done in source: agent_trips, agent_attendance, branch_staff_roles and guarantor_branches have no RLS statement.

**Owner-observed deployment check**

Owner runs in the Supabase SQL editor: select tablename, rowsecurity from pg_tables where schemaname='public' and tablename in ('agent_trips','agent_attendance','branch_staff_roles','guarantor_branches'); also check grants for anon/authenticated and the Security Advisor 'RLS disabled' lint. Where rowsecurity is false, run ALTER TABLE ... ENABLE ROW LEVEL SECURITY with no policies and add the DDL (including CREATE TABLE for the two undefined tables) to the repo migrations.


### 20. Commission payout PATCH can re-process Paid or Rejected payouts and POST amount is not capped by earned commission

`commission-payout-patch-no-pending-state-guard`  
**Boundary:** Staff or stale screen → re-process a settled payout

PATCH /api/commissions/payout (Admin or Staff) sets a payout to Paid or Rejected for any existing payout ID without requiring the current Status to be Pending. A Paid payout can be flipped to Rejected, or a Rejected one to Paid, repeatedly, and Processed At and Notes are overwritten each time. Any action other than 'reject' is treated as Paid. On the request side, a Guarantor's POST only checks amount > 0. The amount is not bounded by accrued unpaid commission, and the hasPending check is a non-atomic read-then-insert, so parallel POSTs can create several Pending rows. The UI hides actions for non-Pending rows, but that is client-side only. Every PATCH actor is a privileged Admin or Staff principal, and each POST request is reviewed by a human admin. The realistic impact is ledger or audit-trail integrity, such as a stale-UI double submission or a Staff user rewriting a processed decision, not an external-attacker compromise.

**Claimed root cause.** No Status === 'Pending' state-machine guard before the update in PATCH, and no server-side cap of the requested amount against earned minus already paid commission or atomic uniqueness of pending requests in POST.

**Source trace**

1. `app/api/commissions/payout/route.ts:106` (entrypoint, PATCH handler): Admin/Staff PATCH reads payoutId and action from the body (lines 108-112). The role check is the only gate.
1. `app/api/commissions/payout/route.ts:115` (propagation, PATCH handler): The payout row is looked up by ID and only existence is checked (line 116). Its Status is never examined.
1. `app/api/commissions/payout/route.ts:123` (sink, PATCH handler): updateById overwrites Status (Paid, or Rejected only when action === 'reject'), Processed At and Notes regardless of the prior state (lines 118-127).

**Evidence**

- `components/pages/PayoutRequestsPage.tsx:88`: The UI splits rows into pending and processed and offers actions only for Pending rows, so the state guard exists only client-side.
- `app/api/commissions/payout/route.ts:71`: POST validates only amount > 0. There is no cap against earned commission, which is not computed server-side (lines 86-88 only require a completed 35-day cycle).
- `app/api/commissions/payout/route.ts:80`: The hasPending check reads the table and then appends at line 93, with no atomicity. The read may also be served from the cache.

**Exact blockers**

- No target code was executed: no OS-enforced sandbox with memory limits on this host; target code was not executed.
- Downstream financial effect depends on out-of-band payment practice. The PATCH only records status, and admins review the amount on each request. The decisive unobserved fact is whether admins pay on the stated amount without reconciling against commission, and whether Staff re-processing has any real effect.
- The caching behaviour and race window of readTable('PayoutRequests') were not observed at runtime.

**Bounded local next step**

With dummy data in a local stack, PATCH an already-Paid payout with action 'reject' and observe Status become Rejected with an overwritten Processed At. PATCH it again with action 'approve' and observe Paid. Send action 'foo' and observe Paid. As a dummy Guarantor with a past 35-day cycle, POST an amount larger than any commission earned and observe a Pending row created. Fire two concurrent POSTs and count the Pending rows.

**Owner-observed deployment check**

Owner should confirm the admin payout reconciliation process, whether the displayed requested amount is verified against earned commission before payment, and whether any other system consumes PayoutRequests.Status as the source of truth for payments.


### 21. Settlement duplicate check depends on a free-text marker and is non-atomic; amounts and recordedBy are unvalidated

`settlements-post-text-marker-dedupe-and-unvalidated-amounts`  
**Boundary:** Staff or forged QR → duplicate or inflated settlement

POST /api/settlements (Admin/Staff only) dedupes only when the client-supplied notes contain 'QR Payout' and match /PYOUT\d+/. It then does a read-then-insert substring match over Settlements.Notes for the same entityId. If the caller omits the marker, changes the text, or posts in parallel, several settlements can be recorded for the same payout. The settlement is never linked to or verified against the PayoutRequests row. totalCashDue, totalUpiDue and amountSubmitted are not type- or range-checked, and recordedBy is taken from the body instead of the session. The collections, repayments and loans reads and inactiveLoanIds are computed but never used. Source also shows PATCH with the same numeric gaps. The checked-in supabase_schema.sql declares settlements.total_cash_due, total_upi_due, amount_submitted and balance as DECIMAL(12,2) and recorded_by as NOT NULL REFERENCES users(user_id). Whether the live database matches that file is unknown. If it does, non-numeric strings and an empty recordedBy would be rejected at the database, and it also has no unique key on a payout ID. Negative or oversized numeric values would still be accepted, because no CHECK constraint is visible. Impact is limited to financial-ledger integrity by an authenticated privileged user or a client bug. It crosses no lower-privilege trust boundary.

**Claimed root cause.** Idempotency relies on parsing client free-text notes instead of a server-owned unique payout reference with a unique constraint. Money fields and attribution come from the client without validation, server recomputation, or use of the session user.

**Source trace**

1. `app/api/settlements/route.ts:28` (entrypoint, POST handler): requireRole(['Admin','Staff']) at line 29, then entityType, entityId, notes, amounts and recordedBy are read from the JSON body at lines 30-31.
1. `app/api/settlements/route.ts:36` (propagation, POST duplicate check): Dedupe runs only if notes include 'QR Payout' and match PYOUT\d+. It then does a read-then-compare substring check on Settlements Notes at lines 39-41, with no lock or unique key.
1. `app/api/settlements/route.ts:57` (sink, POST handler): appendRow('Settlements') inserts the client-supplied amounts, Notes and Recorded By, plus a Status and Balance computed from them.

**Evidence**

- `app/api/settlements/route.ts:67`: Balance uses Math.max(0, cashDue - submitted) and Status (line 68) is Settled when submitted >= due. Both are computed from unvalidated body values, with no Number() coercion or sign check.
- `app/api/settlements/route.ts:45`: collections, repayments and loans are read, and inactiveLoanIds is computed at line 50, but none is used in any check.
- `app/api/settlements/route.ts:70`: 'Recorded By' is set from body.recordedBy, not the session user.
- `supabase_schema.sql:255`: The settlements table has a DECIMAL(12,2) amount column type and NOT NULL REFERENCES users for recorded_by (line 268). It has no unique payout reference and no CHECK constraints. This is the checked-in schema, and the live schema may differ.
- `components/pages/GuarantorPage.tsx:441`: Commission balance is loan commission minus the sum of Settlements.Amount Submitted, so duplicate or inflated rows corrupt the balance.

**Exact blockers**

- No OS-enforced sandbox with memory limits on this host; target code was not executed.
- The live Supabase settlements schema is not observable from source. It is unknown whether column types, a payout-ID unique key, or CHECK constraints differ from supabase_schema.sql.
- The actor is Admin/Staff only, so impact is ledger integrity. It is unknown whether the live recorded_by FK rejects an empty or forged recordedBy.

**Bounded local next step**

Use a dummy database with the checked-in schema and dummy Admin credentials. POST two settlements for the same entityId, one with notes 'QR Payout PYOUT1' and one with notes 'payout'. Confirm both are stored. Then POST two parallel requests with the marker and see whether both succeed. Next POST amountSubmitted=-5, a huge value, and a non-numeric string, and record the stored Amount Submitted, Balance and Status. Finally POST recordedBy as an empty string and as another user's ID.

**Owner-observed deployment check**

The owner should check the live settlements table: column types, any unique index or CHECK on amounts, and the recorded_by FK. They should also confirm whether the table is written through the service-role key only.


### 22. Deposit withdrawal approval is a non-atomic check-then-act and does not re-validate eligibility

`deposit-request-approve-nonatomic-no-revalidation`  
**Boundary:** Double approval → duplicate ledger debit

PATCH /api/deposits/request (Admin/Staff only) checks Status === 'Pending' from a possibly cached read, appends an Interest Payout or Principal Withdrawal ledger row, and only afterwards marks the request Paid, with no transaction or conditional update. A double-submitted or concurrent approval, or an approval on an instance with a stale cache, can append a second ledger debit. A failure between the two writes leaves a ledger row and a still-Pending request, so a retry duplicates the debit. Parallel guarantor POSTs can create two Pending requests for the same interest, and approval never recomputes the account. Every approval needs an authenticated Admin or Staff caller, so the trigger is a privileged user's double-click or retry, or a guarantor's parallel POST followed by an admin approving both. Impact is limited to ledger integrity, and the exploitable window is unobserved.

**Claimed root cause.** The ledger append and the request status update are separate, non-transactional Supabase calls. The guard is a non-atomic cached read, there is no conditional update on Status, and the deposit account is not recomputed at approval.

**Source trace**

1. `app/api/deposits/request/route.ts:71` (entrypoint, PATCH handler): Admin/Staff approval by requestId. requireRole at line 72 gates the caller.
1. `app/api/deposits/request/route.ts:79` (propagation, PATCH handler): Status !== 'Pending' check on a row from readTable('DepositRequests') (line 76), which is cache-eligible and not forceFresh.
1. `app/api/deposits/request/route.ts:87` (propagation, PATCH handler): Deposits ledger row appended (Interest Payout or Principal Withdrawal) before the request is marked Paid. Amount comes from the stored request and is not recomputed.
1. `app/api/deposits/request/route.ts:93` (sink, PATCH handler): updateById sets Status to Paid afterwards. It is an unconditional update by id, not guarded by Status = 'Pending'.

**Evidence**

- `lib/supabase-db.ts:217`: Per-instance in-memory cache with a 30 s TTL. readTable returns the cached rows unless forceFresh is passed, so the PATCH status check can be stale. The cache is only invalidated after writes.
- `app/api/deposits/request/route.ts:45`: The POST pending-request check is a non-atomic read-then-insert (append at line 62). Parallel POSTs can both pass.
- `lib/deposits.ts:79`: availableInterest is computed from the ledger and used only at POST time (route.ts line 49). PATCH does not call computeDepositAccount.

**Exact blockers**

- No OS-enforced sandbox with memory limits on this host; target code was not executed.
- Whether concurrent PATCHes actually double-append depends on timing and deployment: single or multiple instances, cache state, and whether the database has a unique or constraint guard on Deposits per request ID. The Notes column holds the request ID only as text, and the schema and live constraints were not inspected.
- Exploitability needs a privileged Admin/Staff caller or admin approval of duplicate Pending requests, so impact across a trust boundary is limited to financial-integrity errors.

**Bounded local next step**

With dummy Supabase data (or a mocked client) and no real credentials, send two concurrent PATCH calls for one dummy Pending request as a dummy Admin, then count the Deposits rows whose Notes contain that request ID and read the final request Status. Also send two parallel guarantor POSTs for one dummy guarantor with an eligible interest balance and count the Pending DepositRequests rows. Finally, inject a failure in updateById and confirm that a retry appends a second ledger row.

**Owner-observed deployment check**

Owner confirms the number of server instances and whether the Deposits table has a unique constraint or trigger preventing duplicate ledger entries per request ID. Owner also checks the production Deposits ledger for more than one Interest Payout or Principal Withdrawal row with the same 'Withdrawal request <id>' Notes value.


### 23. Notification mark-read does not verify the notification belongs to the caller

`notifications-patch-missing-recipient-check`  
**Boundary:** Any logged-in user → another user's read flag

PATCH /api/notifications authenticates the caller with getSession, but the result is unused. It finds the notification by the body notificationId only, then sets Is Read to 'true' through updateById. It never compares User ID or Role to the session. Any authenticated user who holds another recipient's notification ID can mark that notification read. For role-addressed rows this also flips the shared read state for everyone in that role. The impact is limited to the integrity of a read flag. No data is disclosed.

**Claimed root cause.** The PATCH lookup and update are keyed on the client-supplied notificationId without the recipient filter (User ID equals session.userId, or Role equals session.role) that GET applies.

**Source trace**

1. `app/api/notifications/route.ts:21` (entrypoint, PATCH /api/notifications): The handler calls getSession (line 22) and reads notificationId from the JSON body (line 23). The session value is never used afterwards.
1. `app/api/notifications/route.ts:25` (propagation, PATCH /api/notifications): The notification is found by Notification ID only, with no check of User ID or Role.
1. `app/api/notifications/route.ts:27` (sink, PATCH /api/notifications): updateById sets Is Read to 'true' for whichever row matched, whoever its recipient is.

**Evidence**

- `app/api/notifications/route.ts:11`: GET restricts rows to n['User ID'] === session.userId or n['Role'] === session.role. This is the intended recipient boundary, and PATCH omits it.

**Exact blockers**

- No OS-enforced sandbox with memory limits on this host; target code was not executed, so the result is source-only.
- Exploitation needs another recipient's Notification ID. How IDs are generated (guessable or sequential) and whether they are exposed to other users elsewhere (for example in entityId or other routes) was not traced. This decides likelihood, but impact stays limited to the read flag.

**Bounded local next step**

With a local dummy Supabase and two dummy users, user A and user B, create a Notifications row addressed to A. Send PATCH /api/notifications as B with A's notificationId. Today, expect success true and Is Read set to 'true' on A's row. After adding a recipient check, expect success false and no change. Separately, inspect the notification ID generator in the code that inserts into Notifications to judge guessability.

**Owner-observed deployment check**

Not applicable.


### 24. Authenticated JSON endpoints accept unbounded base64 file bodies with no size or type cap

`authenticated-json-base64-upload-no-size-cap`  
**Boundary:** Any logged-in user → server memory and storage quota

POST /api/leads, POST /api/repayments and POST /api/profile read the whole JSON body into memory. They pass attacker-supplied base64 strings to Drive or Supabase Storage with no length, MIME or aggregate limit. Each requires only a valid session of any role, including Guarantor. POST /api/repayments also needs an existing repaymentId and reads the full Repayments and Loans tables first. A large body is buffered and copied several times in the Node process, and large objects can be persisted to the shared Drive or Storage quota. Impact on other users depends on deployed body limits and process isolation, which source cannot show.

**Claimed root cause.** createLeadSchema uses unbounded z.string() for the six photo fields. The repayments and profile handlers use raw req.json() with no validation of paymentProof or photoFile. next.config.ts sets no body limit. No middleware or proxy file exists, so only an unseen proxy or host could bound the body.

**Source trace**

1. `app/api/leads/route.ts:76` (entrypoint, POST): Any authenticated role calls POST /api/leads. getSession and csrfProtection are the only gates; there is no requireRole and no size check.
1. `lib/validation.ts:7` (propagation, validateBody): await req.json() buffers and parses the whole body. The schema (lines 72-77) accepts the photo fields as z.string().optional() with no max length.
1. `app/api/leads/route.ts:123` (propagation, toPayload): b64.split(',') creates extra copies of each large string, and the base64Data is passed on to the upload helper.
1. `app/api/leads/route.ts:128` (sink, uploadLeadPhoto): Up to six unbounded files per request are uploaded to Drive. The catch at line 134 swallows errors. Sibling sinks are app/api/repayments/route.ts:127 and app/api/profile/route.ts:77, both via saveFileSupabase (lib/drive.ts:92).

**Evidence**

- `lib/validation.ts:72`: The photo fields are z.string().optional() with no max length or data-URL prefix check.
- `app/api/repayments/route.ts:105`: Raw await req.json(). paymentProof.fileName, mimeType and base64Data are used unvalidated at lines 127-132, and the fileName is placed into the storage path.
- `app/api/profile/route.ts:76`: body.photoFile is uploaded unvalidated at line 77, and the extension and MIME type come from body.photoFileType.
- `next.config.ts:3`: nextConfig sets only allowedDevOrigins and has no body-size or other limits.

**Exact blockers**

- Deployed body-size caps are not visible in source: the reverse proxy (nginx client_max_body_size) or the host (for example Vercel's 4.5 MB function limit).
- Process isolation and restart behaviour (pm2 or serverless) are unknown.
- no OS-enforced sandbox with memory limits on this host; target code was not executed

**Bounded local next step**

In a memory-limited container with dummy Supabase and Drive mocks, run the Next server and POST /api/leads with a dummy Guarantor token and customerPhoto set to a data URL of 50 MB, then 200 MB. Record whether the request is accepted, peak RSS, and whether the mock upload receives the full payload. Repeat for /api/profile with photoFile. Stop at the first observed bound.

**Owner-observed deployment check**

Owner to check the configured maximum request body size at the proxy or host in front of /api/*, and whether one Node process serves all users. Also check the Drive and Storage quota alerts.

---

## Part B. Fix plan for later (nothing has been changed in the code yet)

Do these **after the full build is complete**. Work one fix at a time, typecheck after each, then test the screens named below.

### Before any change
1. **Make a backup copy** of the whole project folder (leave out `node_modules.nosync` and `.next.nosync`). This folder is not a git repository, so a copy (or `git init` and a first commit) is the only undo.
2. Create **test logins** (one Guarantor, one NGF Agent, one Staff) so the role checks can be tested on the real screens. Admin login is already available.

### Order of fixes

| Step | Fix | Files | Risk | Test after |
|---|---|---|---|---|
| 1 | Put the Admin check back on `GET /api/dev/migrate-db` (also add the production guard only if the migration is no longer needed in production) | `app/api/dev/migrate-db/route.ts` (about line 197) | Very low | Dev page as Admin still works; call without a token returns 401 |
| 2 | Remove the secret values from `BRAIN.md` and `log.md`; add both to `.gitignore` | `BRAIN.md`, `log.md`, `.gitignore` | None | n/a |
| 3 | **Rotate** (only when ready to update every place that uses them): Supabase service-role key, Google OAuth client secret and refresh token, `SETUP_SECRET`, admin password | `.env.local`, any live server settings | Medium: old keys stop working at once | App loads data; Drive upload works after a new Google token is made on the Dev page |
| 4 | Ownership check on `POST /api/repayments`: Guarantor only on own loans, agent only on assigned loans, Admin and Staff on all; refuse a repayment that is already Paid; do not overwrite Waived | `app/api/repayments/route.ts` | Low to medium (a rule that is too strict blocks real collections) | Collection page as Admin, Guarantor and Agent |
| 5 | Agent can submit verification only for a lead assigned to them, and only in the right status | `app/api/leads/[leadId]/route.ts` (submitVerification) | Low to medium | Agent verification screen |
| 6 | Same scoping for `agent/attendance` and `agent/trips` `GET` (agentId only for Admin and Staff), `collection-sheet`, `notifications` (PATCH owner check, GET role match only for broadcast rows), `dashboard` (Admin figures only for Admin) | the matching route files | Low | Each role's dashboard, notifications and collection sheet |
| 7 | File proxy ownership: Admin and Staff see all; others only files that belong to their own records; keep profile photos visible where the UI needs them | `app/api/drive/[fileId]/route.ts`, `lib/supabase.ts` | **Highest**: broken images if a rule is too strict | Customers, ID card, payment proofs, profile pictures for every role |
| 8 | Read role and status from the database on every request, not only from the token; make a permanent block actually block (store a far-future date or a flag, parse "7d"/"30d" as days) | `lib/api.ts`, `app/api/staff/block/route.ts`, `app/api/auth/login/route.ts` | Medium | Block, unblock, demote a test user and confirm the old session stops |
| 9 | Escape text in the print windows (commission receipt, ID card), allow only image data in the profile photo field | `components/pages/CommissionsPage.tsx`, `lib/idCard.ts`, `app/api/profile/route.ts` | Low | Print a receipt and an ID card |
| 10 | Remaining hardening: escape the Drive folder name, clean storage file names, a size limit for uploads, trusted-proxy handling for the rate limiter, payout and deposit state guards, renewal ownership check | see Part A, section 5 | Low to medium | See each lead's test plan |

### How to confirm each lead
Each lead in Part A has a **local test** (uses dummy data in a throwaway copy) and an **owner check** (read a setting or a log; never send test traffic to the live system). Run the local test before fixing, and again after.

### Known side findings (not security, fix when convenient)
- `loans.customer_id` is `UNIQUE`, so renewing a loan for the same customer is rejected by the database.
- The "Not Paid" and deposit-type mismatches were already fixed for the Collection page save; deposit types still differ between the code and the database.
- A failed login writes an audit row with role `unknown`, which the database rejects.
