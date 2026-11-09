# Bank payout file (To disburse)

Loan money is paid through the bank's payment portal, which reads an Excel file by machine. The CRM makes that file. Built 2026-11-10.

## Flow
1. Agent enters account number, IFSC, name in the bank account and a passbook photo at verification (`VerificationsPage`). For a renewal the details are already saved on the customer.
2. Staff open **Leads > Disbursements > To Disburse**, press **Bank details** on a customer, call the customer, check each item (and the passbook photo), tick "I called the customer...", Save. Changing any detail clears the verified mark.
3. Select the verified customers (checkbox, "Select all ready") and press **Create bank file**. A check table shows every row; confirming creates one file for renewals and one for new customers and downloads them.
4. Upload the file(s) in the bank portal. After the bank pays, press **Mark disbursed** on each customer (creates the loan as before; a warning shows if the customer is in no bank file).
5. **Bank files** (last 14 days): Download again (same file, same numbers) or Cancel a file that was not paid (reason required; the references stay used).

## File format (copied from the bank's sample NGC-09112026.xls; must not change)
- Real `.xls` (Excel 97-2003), one sheet named `Sheet1`, header row of 25 columns, one row per payment. Written by `lib/xlsWriter.ts` (no outside package); checked cell by cell against the sample (0 differences).
- File name `NGC-DDMMYYYYNN.xls`: hyphen only after NGC, NN = 01, 02... the files made that day.
- A `S` when the IFSC starts SIBL, else `N`. B reference = `YYYYMMDD` + running number (01..99, 100, 101...), unique in every file ever (database unique constraint; cancelled files keep theirs). D date = the day the file is made. Fixed columns (sender IFSC SIBN0000768, type 11, sender account, NGF FINCORP, SMS, mobile, INDIA, A1234, IN) are defaults in `lib/bankFile.ts`; Admin can override with Settings key `bank:sender` (JSON). O..R beneficiary IFSC, type 10, account number (stored as text, leading zeros kept), name as in the bank. W remarks `LEND <4 digits>`. Amount = net disbursed.
- If a file was made by hand the same day, fill "Reference numbers start at" in the check screen.

## Rules enforced
- IFSC `^[A-Z]{4}0[A-Z0-9]{6}$`, account 9 to 18 digits, name present; the lead must be Approved, not disbursed, bank details verified, not in another live file, no two customers with the same account number in one go.
- Tables `bank_payout_batches`, `bank_payout_lines` (migration `20261110120000_bank_payout.sql`). Leads and customers gained `account_holder`, `passbook_photo_url`, `pay_number`; leads also `bank_verified_at/by`.
- API: `app/api/disbursements/bank/route.ts` (GET list or `?batchId=` download, POST saveDetails / createFiles / cancelBatch). Audit: BANK_DETAILS_SAVED, BANK_FILE_CREATED, BANK_FILE_DOWNLOADED, BANK_FILE_CANCELLED (no account numbers in the log).

## Customer number and loan ids
The customer's 4-digit number (`customers.pay_number`) is made once (reserved when the first bank file is made, else at disbursement), is unique against customers, pending leads, guarantor numbers and old loan ids, and never changes. First loan id `NGF-GBN-7425`; a renewal `NGF-GBN-7425R2`, `R3`... (`lib/payNumber.ts`). Existing loans keep their ids; their customers got `pay_number` from the digits of their loan id. `payCodeFromLoanId` reads the 4 digits from every format.

## Not covered
Not tested in the real bank portal or in Microsoft Excel itself (read back with xlrd and macOS QuickLook): upload the first file and check the portal's own validation before paying.

## Delete (test files)
Bank files list has a red **Delete** on every file that has no customer marked disbursed (`deleteBatch`): it erases the file and its lines, freeing the file number and reference numbers (next file number = highest of the day + 1). Added for testing; it is audited (BANK_FILE_DELETED). Never use it on a file that went to the bank. Consider restricting it to Admin once real payments start.
