import test from 'node:test';
import assert from 'node:assert/strict';
import Role from '../models/Role.js';
import { ROLE_TEMPLATES } from '../config/roles.config.js';

test('marketing document-use approval is an explicit fail-closed role permission', () => {
    const permissionPath = Role.schema.path('approvalRights.marketingDocumentUse');
    assert.ok(permissionPath, 'Role schema must define approvalRights.marketingDocumentUse');
    assert.equal(permissionPath.defaultValue, false, 'permission must default to false');

    for (const [templateName, template] of Object.entries(ROLE_TEMPLATES)) {
        assert.equal(
            template.approvalRights?.marketingDocumentUse,
            false,
            `${templateName} must not receive document-use approval by default`
        );
    }
});

test('role cloning preserves an explicitly configured marketing document-use approval right', () => {
    const role = new Role({
        name: 'Marketing Compliance Reviewer',
        department: 'marketing',
        approvalRights: { marketingDocumentUse: true }
    });
    const clone = role.clone('Marketing Compliance Reviewer Copy');

    assert.equal(clone.approvalRights.marketingDocumentUse, true);
});
