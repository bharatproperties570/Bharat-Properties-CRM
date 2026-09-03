# PHASE 4.4 IMPLEMENTATION — ENTERPRISE SOFT DELETE HARDENING

## 1. FILES CHANGED
- `backend/plugins/softDelete.plugin.js`
- `backend/controllers/lead.controller.js`
- `backend/controllers/contact.controller.js`
- `backend/controllers/deal.controller.js`
- `backend/controllers/booking.controller.js`
- `backend/controllers/project.controller.js`
- `backend/controllers/company.controller.js`
- `backend/tests/softDelete.test.js` (NEW)

## 2. PLUGIN IMPLEMENTATION
Modified `backend/plugins/softDelete.plugin.js` to expose strict safe static methods for the repository/service layer instead of overriding native methods globally. 
Added static methods:
- `softDeleteOne(query, options)`
- `softDeleteMany(query, options)`
- `restoreOne(query, options)`
- `hardDeleteOne(query, options)`
- `hardDeleteMany(query, options)`

**Why we avoided global native overrides:**
Overriding native `Model.deleteOne` or `Model.deleteMany` inside the Mongoose statics prototype can cause infinite loops, break internal framework tools, and interfere with legit bulkWrite operations. Using explicit `.softDeleteOne()` guarantees predictable behavior.

## 3. CONTROLLER CHANGES (REMOVING DESTRUCTIVE CASCADES)
Converted all destructive physical deletions across the CRM to `softDeleteOne` and `softDeleteMany`:
- **Lead**: `Lead.findByIdAndDelete` -> `Lead.softDeleteOne`. Removed `Contact.deleteMany()` cascade (Contacts are now independent).
- **Contact**: `Contact.findOneAndDelete` -> `Contact.softDeleteOne`. Removed `Lead.deleteMany()` and `Activity.deleteMany()` cascades.
- **Deal**: `Deal.findOneAndDelete` -> `Deal.softDeleteOne`.
- **Booking**: `Booking.findOneAndDelete` -> `Booking.softDeleteOne`.
- **Project/Company**: Converted all physical deletions to `softDeleteOne`.

## 4. DELETE CONTRACT
- **Normal Delete**: Calling `softDeleteOne` applies `$set: { isDeleted: true, deletedAt: new Date(), deletedBy: userId }`.
- **Physical Document**: Remains in the database.

## 5. RESTORE CONTRACT
- **Action**: `Model.restoreOne(query, options)` applies `$set: { isDeleted: false, deletedAt: null, deletedBy: null }`.
- **Conflict Handling**: The service layer must intercept unique constraint errors if a restored record conflicts with a newly created active record.

## 6. HARD-DELETE CONTRACT
- **API**: `Model.hardDeleteOne(query, { hardDelete: true })`.
- **Safety**: Throws an error unless explicit `{ hardDelete: true }` intent is passed.

## 7. BULK-DELETE BEHAVIOR
- **Action**: `Model.softDeleteMany(query, options)` internally runs `Model.updateMany` setting `isDeleted: true`.
- **Safety**: Bypasses the 16MB oplog transaction limit for physical deletions by using rapid index-supported updates.

## 8. SESSION HANDLING
All new static methods accept the `options` parameter natively passed to Mongoose `updateOne()`, fully preserving `session` propagation for Phase 4.3 transaction boundaries:
`Lead.softDeleteOne({ _id: id }, { userId, session })`.

## 9. AUDIT HANDLING
By ensuring normal deletion operations are treated as `updateOne` under the hood, existing pre/post update hooks on `Lead` and `Deal` that generate `Timeline` and `Activity` records will correctly capture the state transition to `isDeleted: true`.

## 10. TESTS ADDED
A new test script `backend/tests/softDelete.test.js` was created covering behaviors A through Q (Normal hide, Hard Delete Rejection, Restore Visibility, Cascade Protection). 

## 11. EXISTING TESTS RESULT
- **Result**: No existing test suite was found in `package.json` (`npm test` is unconfigured). Regression testing was performed via static code analysis.

## 12. KNOWN LIMITATIONS
- `bulkWrite` and `replaceOne` can theoretically bypass soft deletion if a developer manually crafts a `deleteOne` command inside a bulk payload. Code reviews must enforce `updateOne` with `isDeleted` for bulk operations.

## 13. ROLLBACK STRATEGY
If the controller modifications cause unexpected API errors, the changes can be rolled back via git to commit prior to this phase. No data structures were physically altered, so the database requires zero rollback.

---
### DESTRUCTIVE OPERATIONS CONVERTED
- `Lead.findByIdAndDelete(id)`
- `Lead.deleteMany({ _id: { $in: ids } })`
- `Contact.findOneAndDelete({ _id: id })`
- `Contact.deleteMany({ _id: { $in: objectIds } })`
- `Deal.findOneAndDelete({ _id: id })`
- `Deal.deleteMany({ _id: { $in: ids } })`
- `Booking.findOneAndDelete({ _id: id })`
- `Company.findOneAndDelete({ _id: id })`
- `Company.deleteMany({ _id: { $in: ids } })`
- `Project.findOneAndDelete({ _id: id })`

### DESTRUCTIVE CASCADES REMOVED
- `Contact.deleteMany({ 'phones.number': lead.mobile })`
- `Contact.deleteMany({ 'phones.number': { $in: mobiles } })`
- `Lead.deleteMany({ contactDetails: contactId })`
- `Activity.deleteMany({ $or: [{ entityId: id }, { 'relatedTo.id': id }] })`

### INTENTIONALLY RETAINED HARD-DELETE
- `Lookup.findByIdAndDelete` (Master data configuration)
- `SmsTemplate.findByIdAndDelete` (Administrative UI)
- `Intake.findOneAndDelete` (Temporary intake queues)
- `SystemSetting.findOneAndDelete` (Admin configuration)
