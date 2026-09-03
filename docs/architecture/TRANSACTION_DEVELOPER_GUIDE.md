# ENTERPRISE TRANSACTION DEVELOPER GUIDE

For Phase 5 Backend Refactoring, all developers MUST adhere to these architectural rules for MongoDB transactions.

### RULE 1: Service Layer Only
Transactions belong in the Service or Application layer. 
Do not initialize `withMongoTransaction` directly inside an Express route handler.

### RULE 2: Session Propagation
Every repository or model write participating in a transaction MUST accept an options object containing the session.
**CORRECT:**
`await Deal.create([data], { session });`
**INCORRECT:**
`await Deal.create(data);` (Will silently execute outside the transaction boundary!)

### RULE 3: No External Side-Effects
NEVER call `sendEmail`, `sendWhatsApp`, or external HTTP APIs inside a database transaction block. 
If the API succeeds but the DB commit fails, you cannot rollback the external email. 
Always execute external APIs AFTER the transaction successfully commits.

### RULE 4: Keep Transactions Short
Do not perform heavy computational work (e.g., resizing images, parsing massive CSVs, hitting ML models) inside a transaction. Prepare all data beforehand, then execute the DB writes quickly to prevent lock contention and `MaxTimeMSExpired` errors.

### RULE 5: Bulk Imports are Chunked
Never use one giant transaction for an import of 1,000+ records. Use batch sizes of 100-200.

### RULE 6: Arrays vs Objects for `create()`
When using Mongoose `.create()` with a session, you MUST pass an array as the first argument, even for a single document.
**CORRECT:**
`await Lead.create([{ name: "Test" }], { session })`
**INCORRECT:**
`await Lead.create({ name: "Test" }, { session })` (Mongoose will interpret the session as a validation options object if not array-wrapped!)

