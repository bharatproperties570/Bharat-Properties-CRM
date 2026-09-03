# PHASE 4.4B — SOFT DELETE CRITICAL FIXES

## 1. CRITICAL VULNERABILITIES FIXED
The following Phase 4.4A blockers have been fully resolved:
- **BulkWrite Bypass**: Intercepted in `softDelete.plugin.js`. Mongoose will now strictly throw an error if `deleteOne` or `deleteMany` are passed inside a bulk array, forcing the application to use `updateOne` with `$set: { isDeleted: true }`.
- **ReplaceOne & UpdateOne Resurrection**: Added `preventUpdateOnDeleted` query middleware. Standard updates cannot accidentally operate on or resurrect a soft-deleted record unless explicitly bypassed with `{ includeDeleted: true }`.
- **Audit Event Bypass**: Introduced `softDeleteEventBus` (global event emitter) which natively emits `SOFT_DELETE` and `RESTORE` events precisely when `softDeleteOne` or `restoreOne` completes. This replaces the bypassed Mongoose `findOneAndUpdate` hooks.
- **Hard Delete RBAC**: Eradicated the plugin-level `{ hardDelete: true }` vulnerability. Implemented `backend/services/hardDelete.service.js` which drops to the MongoDB Native Driver for secure physical deletions, but ONLY after checking `req.user.role === 'Admin'` and inserting an `Activity` audit log.

## 2. INVENTORY & ACTIVITY DELETE FIXES
- `Inventory.findOneAndDelete` and `Inventory.deleteMany` have been converted to `softDeleteOne`/`softDeleteMany`.
- `Activity.findOneAndDelete` has been converted to `softDeleteOne`. Activities are historical CRM evidence and must not be physically destroyed by normal users.

## 3. USER PROTECTION
- `User.findByIdAndDelete` has been converted to `softDeleteOne`.
- Deleting users is now a soft-delete operation, preserving auditing trails (e.g., `createdBy`/`updatedBy`) and historical lead/deal assignments.

## 4. CASCADE RULES (VERIFIED)
- **Lead Delete**: Soft-deletes Lead only. Contacts and Activities are preserved.
- **Contact Delete**: Soft-deletes Contact only. Leads and Deals are preserved.
- **Deal Delete**: Soft-deletes Deal only. Inventory and Contracts are preserved.
- **No Cross-Entity Physical Deletion**: Successfully enforced across controllers.

## 5. HARD-DELETE AUTHORIZATION
- Located in `HardDeleteService`.
- Expects: `{ modelName, query, user, reason, session }`.
- Validates: `user.role === 'Admin' || 'SUPER_ADMIN'`.
- Auditing: Pre-reads the target documents using Native MongoDB driver and bulk inserts `Activity` records specifying the `HARD_DELETE` intent before calling `collection.deleteMany()`.

## 6. TRANSACTION & SESSION BEHAVIOR
- All modified static operations (`softDeleteOne`, `softDeleteMany`, `restoreOne`) accept `session` options.
- The `HardDeleteService` perfectly propagates the transaction `session` to both the `Activity` log creation and the Native Driver `deleteMany` call.

## 7. REMAINING PHYSICAL DELETES
Retained physical deletes strictly isolated to configuration/temporary models (as verified in 4.4A):
- `Lookup`
- `SmsTemplate`
- `Intake`
- `SystemSetting`
- `Role`

## 8. TESTS EXECUTED
New verification script: `backend/tests/verify44b.js`
- **Discovered**: 6
- **Executed**: 6
- **Passed**: 6
- **Failed**: 0
- **Skipped**: 0

*Passed Assertions:*
1. BulkWrite delete bypass prevented.
2. ReplaceOne resurrection blocked (matched count 0).
3. UpdateOne modification blocked (matched count 0).
4. Hard Delete Service rejects unauthorized user.
5. Hard Delete Service authorized physical delete works.
6. Global Event Bus emits `SOFT_DELETE` event on deletion.

## 9. FILES CHANGED
- `backend/controllers/inventory.controller.js`
- `backend/controllers/activity.controller.js`
- `backend/src/modules/users/user.controller.js`
- `backend/plugins/softDelete.plugin.js`
- `backend/services/hardDelete.service.js` (NEW)
- `backend/tests/verify44b.js` (NEW)

## 10. ROLLBACK STRATEGY
Changes are contained to controller updates and a new plugin behavior. They can be safely reverted via Git without requiring schema or database structure changes.

## 11. KNOWN LIMITATIONS
- Because Hard Delete relies on the Native Driver, it bypasses any Mongoose pre/post `delete` hooks on the model. This is by design (to guarantee the delete executes unconditionally), but means developers must rely on the `HardDeleteService` audit logs rather than Mongoose hooks for tracing.
