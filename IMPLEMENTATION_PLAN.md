# Phase 4.6H - Implementation Plan

## 1. Lead Model Changes (`backend/models/Lead.js`)
- Remove `unique: true` from `mobile` and `email`.
- Add pre-save hook to sanitize `email`: `if (this.email === "" || this.email.trim() === "") this.email = undefined;`
- Remove the pre-save hook logic that throws `DuplicateLeadExists`.

## 2. Contact Identity Service (`backend/services/contactIdentity.service.js`)
- Create service with `resolveContactIdentity({ mobile, email, session, createIfMissing, leadData })`.
- Resolve by `mobile`. If missing, check `email`. 
- Handle Conflict: If `mobile` gives Contact A and `email` gives Contact B, return `{ conflict: true, contactA, contactB }`.
- If `createIfMissing` is true and no contact exists, create Contact safely.

## 3. Lead Controller (`backend/controllers/lead.controller.js`)
- In `addLead`: 
  - Call `resolveContactIdentity(..., createIfMissing: false)`.
  - If Contact found and no conflict, assign `lead.contactDetails = contact._id`.
- In `updateLead`:
  - Identify transition to Opportunity stage.
  - Call `resolveContactIdentity(..., createIfMissing: true)`.
  - Link `lead.contactDetails` to the resolved/created contact.
- In `convertLeadToContact`:
  - Use `resolveContactIdentity(..., createIfMissing: true)`.
  - **Crucial:** Remove the logic that moves `Activity` records from Lead to Contact to preserve Lead history.

## 4. Frontend Modal (`src/components/AddLeadModal.jsx`)
- Change the `handleSave` disabled condition: remove `isBlocked` constraint for saving a Lead.
- Adjust UI to show it as a warning rather than blocking.

## 5. Index Migration Script (`backend/scripts/migrate_lead_indexes.js`)
- Script to `dropIndex` for `mobile_1` and `email_1`, then `createIndex` without `unique`. (Will NOT execute).

## 6. Tests (`backend/tests/test_lead_contact_lifecycle.js`)
- Comprehensive test cases A through J as specified.
