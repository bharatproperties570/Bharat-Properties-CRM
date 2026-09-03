# SOFT DELETE MODEL

## 1. Canonical Schema Contract
A standardized, reusable soft-delete mechanism to preserve historical auditability and prevent orphaned references.

```javascript
{
  isDeleted: { type: Boolean, default: false, index: true },
  deletedAt: { type: Date, default: null },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}
```

## 2. API Contract
The plugin exposes the following interface on attached models:
- **`document.softDelete(userId)`**: Sets `isDeleted = true`, `deletedAt = now()`, `deletedBy = userId`.
- **`document.restore()`**: Sets `isDeleted = false`, `deletedAt = null`, `deletedBy = null`.
- **`document.hardDelete()`**: Physically executes `.deleteOne()`. (Restricted to specific admin routes/jobs).
- **Query Overrides**: `.find()`, `.findOne()`, `.countDocuments()` are automatically intercepted to append `{ isDeleted: { $ne: true } }` unless explicitly overridden (e.g., using `.find({}).includeDeleted()`).

## 3. Tiered Model Classification & Application
Soft-delete should NOT be blindly applied to all 54 models.

- **TIER 1 (Core Business Records)**: Apply Soft Delete.
  *Models: Contact, Lead, Inventory, Deal, Booking, Project, User, Team.*
- **TIER 2 (Supporting Records)**: Apply Soft Delete.
  *Models: LeadForm, FeedbackForm, DynamicForm.*
- **TIER 3 (Logs/Events/Audit)**: DO NOT Apply Soft Delete. Append-only lifecycle.
  *Models: AuditLog, AutomationLog, Activity, StageTransitionLog.*
- **TIER 4 (Configuration/Reference Data)**: Hard delete acceptable or manual status flags.
  *Models: Lookup, Role, NotificationSetting.*

## 4. Backfill Strategy (Migration)
During migration, existing documents will be updated as follows:
- `isDeleted = false`
- `deletedAt = null`
- `deletedBy = null`
**Rule**: ONLY apply this update if `isDeleted` does not already exist on the document to avoid overwriting manually preserved states.
