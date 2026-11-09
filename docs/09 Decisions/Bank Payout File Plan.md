# Bank payout file (plan; built 2026-11-10, see [[Bank Payout File]])

Owner's sample: `NGC-09112026.xls` (Excel 97-2003, 25 columns A..Y, header row + one row per payment). The bank portal reads it automatically, so nothing in the format may change. It accepts one sheet at a time.

## Format rules (from the sample)
- Header row exactly: Header, Reference Number, Amount, Transaction date, Sender IFSC, Sender Account Type, SenderA/c Number, Sender Name, Ack Mode SMS/EML, Mob/Email, Send Ad1-4, Benef IFSC, Benef Ac/Type, BenefA/C No, Benf A/c Name, Benef Ad1-4, Remarks, Purpose code, Country code.
- A: `S` when beneficiary IFSC starts with SIBL (South Indian Bank own account), else `N` (NEFT).
- Reference number: YYYYMMDD + running number (01..99, then 100, 101...). Unique forever across every file, past and future.
- Transaction date = date the file is created (stored as a date, shown m/d/yyyy).
- Fixed columns (sender IFSC SIBN0000768, type 11, sender account, NGF FINCORP, SMS, 9999999999, INDIA x4, Benef Ad INDIA x4, A1234, IN) copied as is; kept in an Admin setting.
- Benef IFSC / Benef Ac type 10 / account number (saved as TEXT, keep leading zeros) / name as in the bank.
- Remarks: `LEND ` + customer's 4-digit number.
- Amount = net disbursed (8500 for 10K10W).

## Owner decisions
- No passbook AI scan. The agent types the bank details at verification; staff call the customer to verify them; a passbook photo upload section lets staff check the picture.
- Renewals: the customer's account number, IFSC and bank name are saved on the customer; at renewal staff see the list, call, verify, then disburse.
- The 4-digit number belongs to the customer for life: only new customers get a new one; a renewal keeps it.
- More than 99 payments in a day is fine (100, 101...).
- Renewals and new customers go in separate sheets because the portal takes one sheet at a time.

## Open
- File/sheet name when there are two files on one day; the owner's last message was cut off at "The banking name needs to be same as it is, like ...".
- A renewal needs a new loan id (loans are keyed by loan_id) while the customer's 4 digits stay; payment matching reads the 4 digits from the loan id today, so the number should be stored on the customer.
