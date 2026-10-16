# NGF CRM — Error Log & Fixes

A running log of bugs encountered and how they were resolved. Use this as the first reference before debugging.

---

## 1. Assign Agent / Lead Actions Missing in Admin Leads Page

**Symptom:** Admin Leads page showed only a plain table with no action buttons — no Assign Agent, Approve, Reject, or Reverify options.

**Root Cause:** The Leads page was built as a read-only table without any inline action UI.

**Fix:** Replaced table layout with card layout. Each card has action buttons on the right: View, Assign Agent (dropdown), Approve, Reject, Reverify. Buttons use `flex-col items-start` so they don't stretch full width.

**File:** `components/pages/LeadsPage.tsx`

---

## 2. Action Buttons Too Wide

**Symptom:** Assign Agent, Approve, Reject buttons were stretching the full width of their container.

**Root Cause:** Parent was `flex-col` without `items-start`, causing children to stretch.

**Fix:** Added `items-start` to the action column flex container so buttons only take their natural width.

**File:** `components/pages/LeadsPage.tsx`

---

## 3. "No Agents" Showing in Assign Agent Dropdown

**Symptom:** Assign Agent dropdown appeared empty even though agents existed.

**Root Cause:** No agents had been created yet in the Staff/Agents page at the time of testing.

**Fix:** Not a code bug — user needed to create an agent first via Staff / Agents page. Once an agent was created, the dropdown populated correctly.

---

## 4. Auto-Uppercase Breaking Login (Username/Password)

**Symptom:** After enabling auto-uppercase globally, login username and password fields were being uppercased, preventing login.

**Root Cause:** The global JS event listener and CSS `text-transform: uppercase` were applying to all inputs including login fields.

**Fix:**
- Added `data-no-upper` attribute to username and password inputs on the login page.
- JS listener in `AutoUppercase.tsx` checks for `data-no-upper` and skips those elements.
- Also skips inputs with `type="password"`, `type="email"`, `type="file"`, `type="checkbox"`, `type="radio"`.

**Files:** `components/Login.tsx`, `components/AutoUppercase.tsx`, `app/globals.css`

---

## 5. Images Not Auto-Loading in DriveImage Component

**Symptom:** Document photos in customer detail view showed a blank placeholder and required a manual action to load.

**Root Cause:** The original `DriveImage` component had no `useEffect` — it was waiting for user interaction.

**Fix:** Added `useEffect` that triggers the Drive API fetch on mount as soon as a file ID is available. Shows a spinner while loading.

**File:** `components/ui/DriveImage.tsx`

---

## 6. Customer Photos Too Tall / Cropped

**Symptom:** Profile and document photos were either too tall, cropped, or distorted in the customer detail view.

**Root Cause:** No `max-height` constraint and `object-cover` was cropping instead of fitting.

**Fix:** Changed image class to `max-h-80 object-contain` so the full image is visible without distortion. Placeholder divs set to `h-56` for consistent height.

**File:** `components/ui/DriveImage.tsx`

---

## 7. Photos Not Showing in Customer Detail View (Blank "Not Uploaded")

**Symptom:** Customer had photos uploaded to Drive, but Aadhaar Front, Back, House Photo, Landmark, Cheque all showed "Not uploaded" in the Documents section.

**Root Cause:** The photo URL columns in the Leads Google Sheet were empty. Photos were uploaded to Drive but the sheet URLs were never written (photos uploaded before the URL-saving code was in place).

**Fix (Short-term):** Added "Scan Drive Folder" button in admin lead detail view. Calls `scanFolder` action on `/api/leads/[leadId]` which reads all files from the Drive folder and links them to the correct sheet columns.

**Fix (Scan Logic Bug):** The original scan logic only ran the positional fallback when prefix matching found zero results. So if one photo matched by name prefix, the other 5 empty slots were never filled.

**Fixed scan logic:**
1. **Pass 1 — prefix matching:** Matches files by filename prefix (`customer_`, `aadhaar_front_`, `house_`, etc.)
2. **Pass 2 — positional fallback:** Any image files not matched in Pass 1 are assigned in order to remaining empty slots.

This ensures all available photos get linked regardless of filename.

**File:** `app/api/leads/[leadId]/route.ts` — `scanFolder` action

---

## 8. Document Photos Too Small / 3-Column Grid Too Tight

**Symptom:** With 3 columns on a large screen the document photos were narrow and hard to see.

**Root Cause:** Grid was `sm:grid-cols-2 lg:grid-cols-3` — at large screens each image only got ~1/3 the width.

**Fix:** Changed to `sm:grid-cols-2` max (2 columns only). Images now have more width and display at a better size.

**File:** `components/pages/CustomersPage.tsx`

---

## 9. Loan ID Format Wrong

**Symptom:** Loan IDs were being generated as generic IDs (e.g. `LOANDCD4DJ1B`) instead of the required format.

**Root Cause:** `makeId()` was being called directly without the guarantor code prefix.

**Fix:** Created `makeLoanId(guarantorCode)` function that:
1. Reads all existing loans for that guarantor code prefix (`NGF-{CODE}-`)
2. Generates a random 4-digit number not already in use
3. Returns `NGF-{CODE}-{4-digit}`

**File:** `app/api/leads/[leadId]/route.ts`

---

## 10. Loan Product 10K10W Wrong Weekly Amount and Disbursed Amount

**Symptom:** 10K10W product was showing ₹1,500/week and ₹8,000 disbursed instead of ₹1,000/week and ₹8,500 disbursed.

**Root Cause:** Wrong values in `APP_CONFIG.LOAN_PRODUCTS`.

**Fix:** Updated config:
```
weeklyCollection: 1000
totalCollection: 10000
interestDeduction: 1500
netDisbursed: 8500
```

**File:** `lib/config.ts`

---

## 11. Agent Verification Form Missing Borrower Fields

**Symptom:** Agent verification form showed empty input boxes with no pre-filled data. Agent had to re-enter everything the guarantor already filled.

**Root Cause:** The form was initialised with empty state instead of pulling from the lead record.

**Fix:** All 12 borrower fields (Name, Phone, Aadhaar, Address, House Name, Place, Landmark, Nominee Name, Nominee Phone, Occupation, PAN, Cheque) are now pre-filled from the lead data. Agent can edit any field before submitting. Occupation is a `<select>` dropdown with fixed options.

**File:** `components/pages/VerificationsPage.tsx`

---

## 12. GPS Locate Button Had Black Background

**Symptom:** The new "📍 Locate" GPS button appeared with a black background, clashing with the form design.

**Root Cause:** Button had no explicit background class and inherited a dark default.

**Fix:** Added explicit `bg-[#f4f5f7]` class and `text-[#1a1a2e]` to match other secondary buttons in the form.

**File:** `components/pages/VerificationsPage.tsx`

---

## 13. Image Uploads Too Large (Over 1MB)

**Symptom:** Photo uploads from mobile were large JPEG/HEIC files, causing slow uploads and potential Drive quota issues.

**Root Cause:** No compression was applied before upload.

**Fix:** Added `compressImage()` function using canvas + binary search for JPEG quality. Keeps quality as high as possible while staying under 1MB. Applied to all photo upload inputs in both agent verification and guarantor submit forms.

**File:** `components/pages/VerificationsPage.tsx`, `components/pages/SubmitLeadPage.tsx`

---

## 14. Guarantor Submit Form Had Too Many Fields

**Symptom:** Guarantor's lead submission form had fields like House Name, Landmark, Nominee Name, Nominee Phone, PAN, Cheque — too many for a simple initial submission.

**Root Cause:** Form was copied from the full admin/agent form without trimming.

**Fix:** Guarantor form reduced to 5 fields only: Full Name, Phone, Aadhaar, Address, Place. All other fields collected during agent verification.

**File:** `components/pages/SubmitLeadPage.tsx`

---

## 15. No Delete Option for Staff/Users

**Symptom:** Admin could not delete system users from the Staff page.

**Root Cause:** No DELETE endpoint or UI existed for staff management.

**Fix:**
- Added DELETE handler to `/api/staff` — deletes User row and linked Agent or Guarantor row. Blocks deletion of `username === 'admin'`.
- Added delete button to each user row in the Staff page UI, hidden for the main admin account.

**Files:** `app/api/staff/route.ts`, `components/pages/StaffPage.tsx`

---

## 16. Mobile Layout: View/Assign/Reject Buttons Not Visible

**Symptom:** On mobile, the action buttons on lead cards (View, Assign Agent, Reject, etc.) were hidden or cut off.

**Root Cause:** The card used a rigid horizontal layout that pushed the action column off-screen on small screens.

**Fix:** Card layout made responsive — action buttons stack below customer info on mobile, alongside on larger screens.

**File:** `components/pages/LeadsPage.tsx`

---

## 17. Customer Cards Missing Profile Photo Avatar

**Symptom:** Customer list cards showed no photo, just a plain name.

**Root Cause:** No avatar component existed in the customer list.

**Fix:** Added `CustomerPhoto` component — loads photo from Drive as a circular avatar (`h-12 w-12 rounded-full`). Falls back to a dark circle with the customer's first initial if no photo or load fails.

**File:** `components/pages/CustomersPage.tsx`

---

## 18. No Customer Delete Feature

**Symptom:** Admin had no way to delete customers from the Customers page.

**Root Cause:** No DELETE endpoint or selection UI existed.

**Fix:**
- Added DELETE handler to `/api/customers` — deletes customer row by `customerId`.
- Added "Delete" button to Customers page that enters selection mode — cards become selectable (with checkboxes), then "Confirm Delete" calls the API for each selected customer.

**Files:** `app/api/customers/route.ts`, `components/pages/CustomersPage.tsx`

---

## 19. Closed/Completed Loans Still Showing in Upcoming Settlements (Phantom Cash Collection)

**Symptom:** On the Settlements "This Saturday" page, a guarantor (BINDHU) showed a ₹1,000 cash collection from a customer (SAVITRI) whose loan had already been closed that morning. No one had actually collected the cash, and it wasn't even Saturday yet. Multiple earlier patches didn't remove it.

**Root Cause:** The `/api/settlements/due` endpoint filtered repayments purely by `Due Date === saturday`. It had no awareness of loan status. The offending repayment was a week marked `Paid` (paid date `2026-06-09`, not the due Saturday) on a `Completed` loan, with **no Collection Agent ID, no Payment Mode, no Notes**. The Settlements page interpreted `Paid` + empty mode → "Cash", and empty collector → attributed to the guarantor, producing a phantom collection.

The earlier failed patches assumed a specific close path:
- Filtering `Status === 'Waived'` (foreclose) — didn't match, the row was `Paid`.
- Filtering `Notes` containing `'Balance settled'` (settleBalance) — didn't match, Notes was empty.
- Filtering unpaid repayments on inactive loans — didn't match, the row was `Paid` not unpaid.

The actual data only became clear after dumping the real repayment rows via a temporary debug endpoint (`/api/dev/debug-due`, since removed).

**Fix:** Replaced the guess-based filters with one robust rule keyed on loan status + a reliable real-collection signal. A genuine collection always carries a `Collection Agent ID` (the repayments API stamps `session.userId` whenever a payment is marked). So for any loan that is `Closed` or `Completed`, a week is shown only if it was genuinely collected (`Status === 'Paid'` **and** has a `Collection Agent ID`); active loans are untouched. This covers every close path — foreclose, settle-balance, close-account, and no-collector imported/auto "Paid" weeks.

```ts
const inactiveLoanIds = new Set(
  loans.filter(l => l['Status'] === 'Closed' || l['Status'] === 'Completed').map(l => l['Loan ID'])
)
const due = repayments.filter(r => {
  if (r['Due Date'] !== saturday) return false
  if (r['Status'] === 'Waived') return false
  if (inactiveLoanIds.has(r['Loan ID'])) {
    return r['Status'] === 'Paid' && !!r['Collection Agent ID']
  }
  return true
})
```

Verified against live data: 9 repayments due → 8 kept, 1 excluded (SAVITRI, `Completed` loan, `Paid` with no collector).

**Lesson:** Don't patch settlement/collection bugs from assumptions about how data got into a state. Dump the actual rows first (status, paid date, collector, mode, notes, loan status), then filter on the real distinguishing field.

**File:** `app/api/settlements/due/route.ts`
