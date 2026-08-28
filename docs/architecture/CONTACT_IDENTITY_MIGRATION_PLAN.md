# CONTACT IDENTITY MIGRATION PLAN
*Status: Architecture Defined. Execution on HOLD.*

## 1. Normalization Strategy
Before unique indexes can be applied, existing data must be normalized:
- **Phone Numbers**: Extract from `phones.number`, remove all spaces, dashes, and country codes (default to India +91 rules). Convert to standard 10-digit formats where applicable.
- **Emails**: Extract from `emails.address`, lowercase, trim whitespace.

## 2. Duplicate Discovery
Run read-only aggregations grouping by normalized phone numbers and emails.
- Identify all `Contact` IDs sharing identical phone numbers.
- Filter out cases where empty/null phones are overlapping.

## 3. Collision Report
Output a forensic collision matrix:
`Phone Number | Duplicate Count | Array of Contact ObjectIds | Earliest CreatedAt`

## 4. Merge Strategy
The Contact Deduplication Engine will execute:
- Select the earliest `Contact` as the canonical survivor.
- Migrate all array elements (tags, alternate phones, addresses) from duplicates into the survivor.
- Re-map all external references (`Deal`, `Inventory`, `Booking`, `Activity`, etc.) pointing to duplicates to point to the canonical survivor.
- Hard delete (or archive) the merged duplicates.

## 5. Unique-Index Activation
Once `Collision Report count === 0`:
Execute:
```javascript
db.contacts.createIndex(
  { "phones.number": 1 },
  { unique: true, partialFilterExpression: { "phones.number": { $exists: true, $type: "string", $ne: "" } } }
);
```

## 6. Rollback Strategy
Prior to the merge phase, a full BSON dump of the `contacts` collection must be taken.
If references are corrupted during merge, the original contacts will be restored and reference-healing scripts will revert the `owner/contact` ObjectIds in related collections.
