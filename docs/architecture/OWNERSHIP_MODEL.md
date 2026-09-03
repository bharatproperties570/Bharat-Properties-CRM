# OWNERSHIP & DATA ISOLATION MODEL

## 1. Canonical Ownership Schema
A unified standard for representing tenancy, branch isolation, and user/team ownership across the enterprise CRM.

```javascript
{
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  teams: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Team' }],
  visibility: { type: String, enum: ['Everyone', 'Team', 'Private'], default: 'Team' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}
```

## 2. Legacy Field Preservation (Backward Compatibility)
Do **NOT** remove the following legacy fields during Phase 4.1. They must coexist until Phase 5 backend refactoring is complete:
- `assignedTo`, `owner`, `team`
- `assignment.assignedTo`, `assignment.team`
- `department`, `visibleTo`

## 3. Migration Precedence Rules (Normalization Logic)
When backfilling canonical fields from existing data, use strict deterministic precedence:

**Owner ID Resolution**:
1. `ownerId` (if already set)
2. `assignment.assignedTo`
3. `owner` (if ObjectId)
4. `assignedTo`

**Teams Resolution**:
1. `teams` (if array length > 0)
2. `assignment.team` (cast to array)
3. `team` (cast to array)

## 4. Tenancy (Organization ID) Strategy
Currently, the application lacks a strict multi-tenant SaaS root model.
- **Rule**: `organizationId` MUST remain `optional` during Phase 4.1.
- **Rule**: DO NOT fabricate or invent `organizationId` or `branchId` values if they cannot be deterministically derived from existing User profile contexts.
- **Backfill**: Leave `null` if unable to determine. Once the root tenant model is deployed, a separate controlled backfill will populate this field before making it `required`.
