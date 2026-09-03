# DATABASE MIGRATION FRAMEWORK

## Mandatory Safety Rules
Every migration script in this directory MUST adhere to these enterprise safety standards:

1. **Explicit Target Verification**: Never use `uri.replace()`. Parse the URI or check `mongoose.connection.name` to explicitly log the target database.
2. **Production Safety Gate**: If the target database is production (e.g., `bharatproperties1`), the script MUST abort immediately unless the environment variable `ALLOW_PRODUCTION_MIGRATION=true` is explicitly provided.
3. **Dry-Run Capability**: Must support `--dry-run`. When provided, the script will output counts and diffs without executing any writes.
4. **Idempotency**: Scripts must check if the modification has already been applied (e.g., checking for the existence of a field or a migration log) and skip safely if true.
5. **Batching**: Never use `updateMany` for complex transformations. Use `bulkWrite` with a chunk size (e.g., 500) to prevent RAM exhaustion and oplog bloat.
6. **Logging**: Log start time, end time, total processed, modified count, and failure count.

## Usage
Dry Run:
```bash
node backend/migrations/001-template.js --dry-run
```

Execute on Staging:
```bash
NODE_ENV=staging node backend/migrations/001-template.js
```

Execute on Production (DANGEROUS):
```bash
NODE_ENV=production ALLOW_PRODUCTION_MIGRATION=true node backend/migrations/001-template.js
```
