import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import Document from '../../models/Document.js';
import DocumentVersion from '../../models/DocumentVersion.js';
import SystemServiceReplayLedgerModel from '../../models/SystemServiceReplayLedger.js';
import { DocumentAuditService } from '../../services/DocumentAuditService.js';
import { generateSystemServiceSignature } from '../../services/MarketingComplianceEnforcementService.js';

process.env.NODE_ENV = 'test';
process.env.SYSTEM_SERVICE_SECRET = 'a-secure-32-byte-system-service-secret-for-testing-entropy-001';

async function main() {
    let server = null;
    try {
        server = await MongoMemoryServer.create();
        await mongoose.connect(server.getUri());

        await Document.init();
        await DocumentVersion.init();
        await SystemServiceReplayLedgerModel.init();

        const docIdStr = `doc-standalone-${Date.now()}`;
        const ver = await DocumentVersion.create({
            versionId: `ver-${Date.now()}`,
            documentId: docIdStr,
            versionNumber: 1,
            providerInstanceId: 's3-primary',
            storageKey: 'documents/test.pdf',
            storageBucket: 'test-bucket',
            objectKey: 'documents/test.pdf',
            checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            mimeType: 'application/pdf',
            sizeBytes: 2048
        });

        const doc = await Document.create({
            documentId: docIdStr,
            title: 'Standalone Test Deed',
            category: 'PROPERTY_DEED',
            entityId: new mongoose.Types.ObjectId(),
            entityType: 'Deal',
            status: 'ACTIVE',
            state: 'ACTIVE',
            currentVersionId: ver._id,
            uploadedBy: new mongoose.Types.ObjectId()
        });

        const now = new Date();
        const nonce = `standalone-nonce-${Date.now()}`;
        const ctx = {
            entityId: String(doc.entityId),
            documentId: doc.documentId,
            nonce
        };
        const sig = generateSystemServiceSignature('SYSTEM_COMPLIANCE_ENGINE', now, ctx);

        let verifyError = null;
        try {
            await DocumentAuditService.recordVerificationAudit({
                documentId: doc.documentId,
                auditPayload: {
                    documentId: doc.documentId,
                    versionId: String(ver._id),
                    entityId: doc.entityId,
                    entityType: 'Deal',
                    verifierId: 'SYSTEM_COMPLIANCE_ENGINE',
                    verifiedAt: now,
                    outcome: 'VERIFIED'
                },
                systemContext: {
                    serviceId: 'SYSTEM_COMPLIANCE_ENGINE',
                    systemSignature: sig,
                    nonce
                }
            });
        } catch (err) {
            verifyError = err.message;
        }

        const docAfterVerify = await Document.findById(doc._id);
        const ledgerAfterVerify = await SystemServiceReplayLedgerModel.findOne({ signature: sig });

        // Revocation path
        const revokeNonce = `standalone-revoke-nonce-${Date.now()}`;
        const revokeCtx = {
            entityId: String(doc.entityId),
            documentId: doc.documentId,
            nonce: revokeNonce
        };
        const revokeSig = generateSystemServiceSignature('SYSTEM_COMPLIANCE_ENGINE', now, revokeCtx);

        let revokeError = null;
        try {
            await DocumentAuditService.revokeVerificationAudit({
                documentId: doc.documentId,
                revocationReason: 'STATUTORY_COURT_INJUNCTION',
                revokedBy: 'SYSTEM_COMPLIANCE_ENGINE',
                systemContext: {
                    serviceId: 'SYSTEM_COMPLIANCE_ENGINE',
                    systemSignature: revokeSig,
                    nonce: revokeNonce,
                    timestamp: now
                }
            });
        } catch (err) {
            revokeError = err.message;
        }

        const docAfterRevoke = await Document.findById(doc._id);
        const ledgerAfterRevoke = await SystemServiceReplayLedgerModel.findOne({ signature: revokeSig });

        await mongoose.disconnect();
        await server.stop();

        if (process.send) {
            process.send({
                success: true,
                verifyError,
                verifyDocMutated: Boolean(docAfterVerify.verificationAudit),
                verifyLedgerStatus: ledgerAfterVerify ? ledgerAfterVerify.status : null,
                verifyLedgerFailureReason: ledgerAfterVerify ? ledgerAfterVerify.failureReason : null,
                revokeError,
                revokeDocRevoked: Boolean(docAfterRevoke.isRevoked),
                revokeLedgerStatus: ledgerAfterRevoke ? ledgerAfterRevoke.status : null,
                revokeLedgerFailureReason: ledgerAfterRevoke ? ledgerAfterRevoke.failureReason : null
            });
        }
        process.exit(0);
    } catch (e) {
        if (process.send) {
            process.send({ success: false, error: e.message });
        }
        process.exit(1);
    }
}

main();
