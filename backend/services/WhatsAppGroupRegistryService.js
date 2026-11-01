import WhatsAppGroupRegistry from '../models/WhatsAppGroupRegistry.js';
import WhatsAppIntegration from '../models/WhatsAppIntegration.js';

export class WhatsAppGroupRegistryService {
    /**
     * Extracts normalized sender identifiers (phone and optional LID) from Baileys sock.user
     */
    static getSenderIdentifiers(sockUser) {
        if (!sockUser) return { senderPhone: null, senderLid: null };
        const rawId = sockUser.id || '';
        const rawLid = sockUser.lid || '';

        const senderPhone = rawId.split('@')[0].split(':')[0].replace(/\D/g, '') || null;
        const senderLid = rawLid.split('@')[0].split(':')[0].replace(/\D/g, '') || null;

        return { senderPhone, senderLid };
    }

    /**
     * Determines whether a participant in Baileys group metadata matches the sender
     */
    static isSenderParticipant(participant, senderPhone, senderLid) {
        if (!participant || !participant.id) return false;
        const pDigits = participant.id.split('@')[0].split(':')[0].replace(/\D/g, '');
        if (!pDigits) return false;

        if (senderPhone && (pDigits === senderPhone || pDigits.endsWith(senderPhone) || senderPhone.endsWith(pDigits))) {
            return true;
        }
        if (senderLid && pDigits === senderLid) {
            return true;
        }
        return false;
    }

    /**
     * Evaluates permission status from group metadata and sender identifiers
     */
    static evaluatePermission(groupMeta, senderPhone, senderLid) {
        const isAnnounce = Boolean(groupMeta?.announce || groupMeta?.isCommunityAnnounce);
        const isRestrict = Boolean(groupMeta?.restrict);
        const participants = Array.isArray(groupMeta?.participants) ? groupMeta.participants : [];

        let senderIsAdmin = false;
        let senderIsSuperAdmin = false;
        let senderInGroup = false;

        for (const p of participants) {
            if (this.isSenderParticipant(p, senderPhone, senderLid)) {
                senderInGroup = true;
                if (p.admin === 'admin') {
                    senderIsAdmin = true;
                } else if (p.admin === 'superadmin') {
                    senderIsAdmin = true;
                    senderIsSuperAdmin = true;
                }
                break;
            }
        }

        // If participants list was provided but sender was not found in it,
        // sender might have left or been removed
        if (participants.length > 0 && !senderInGroup) {
            return {
                announce: isAnnounce,
                restrict: isRestrict,
                senderIsAdmin: false,
                senderIsSuperAdmin: false,
                permissionStatus: 'LEFT_OR_REMOVED',
                status: 'INACTIVE',
                canSend: false,
                reason: 'Sender account is no longer a member of this WhatsApp group'
            };
        }

        // Announcement group: Only admins/superadmins can post
        if (isAnnounce) {
            if (senderIsAdmin || senderIsSuperAdmin) {
                return {
                    announce: true,
                    restrict: isRestrict,
                    senderIsAdmin,
                    senderIsSuperAdmin,
                    permissionStatus: 'CAN_SEND',
                    status: 'ACTIVE',
                    canSend: true,
                    reason: null
                };
            } else {
                return {
                    announce: true,
                    restrict: isRestrict,
                    senderIsAdmin: false,
                    senderIsSuperAdmin: false,
                    permissionStatus: 'ADMIN_ONLY_RESTRICTED',
                    status: 'RESTRICTED',
                    canSend: false,
                    reason: 'Announcement group: Only group admins can post messages'
                };
            }
        }

        // Standard group: Any member can post
        return {
            announce: false,
            restrict: isRestrict,
            senderIsAdmin,
            senderIsSuperAdmin,
            permissionStatus: 'CAN_SEND',
            status: 'ACTIVE',
            canSend: true,
            reason: null
        };
    }

    /**
     * Synchronizes all participating groups from a live Baileys socket into WhatsAppGroupRegistry.
     * Idempotent: upserts active groups and marks removed groups as LEFT_OR_REMOVED.
     */
    static async syncAllGroups(integrationId, sock) {
        if (!integrationId || !sock) return { count: 0, groups: [] };

        const { senderPhone, senderLid } = this.getSenderIdentifiers(sock.user);
        let rawGroups = {};

        try {
            if (typeof sock.groupFetchAllParticipating === 'function') {
                rawGroups = await sock.groupFetchAllParticipating();
            }
        } catch (fetchErr) {
            console.error(`[WhatsAppGroupRegistry] groupFetchAllParticipating failed for integration ${integrationId}:`, fetchErr.message);
            throw fetchErr;
        }

        const groupsList = Object.values(rawGroups || {});
        const activeGroupJids = new Set();
        const bulkOps = [];
        const now = new Date();

        for (const g of groupsList) {
            if (!g || !g.id) continue;
            const groupJid = String(g.id).trim();
            activeGroupJids.add(groupJid);

            const perm = this.evaluatePermission(g, senderPhone, senderLid);
            const participantCount = Array.isArray(g.participants) ? g.participants.length : (g.size || 0);

            bulkOps.push({
                updateOne: {
                    filter: { integrationId, groupJid },
                    update: {
                        $set: {
                            subject: g.subject || 'WhatsApp Group',
                            participantCount,
                            announce: perm.announce,
                            restrict: perm.restrict,
                            senderIsAdmin: perm.senderIsAdmin,
                            senderIsSuperAdmin: perm.senderIsSuperAdmin,
                            permissionStatus: perm.permissionStatus,
                            metadataFetchedAt: now,
                            lastVerifiedAt: now,
                            status: perm.status,
                            lastError: perm.reason
                        },
                        $inc: { metadataVersion: 1 }
                    },
                    upsert: true
                }
            });
        }

        if (bulkOps.length > 0) {
            await WhatsAppGroupRegistry.bulkWrite(bulkOps, { ordered: false });
        }

        // Mark previously registered groups that are no longer in participating list as LEFT_OR_REMOVED
        if (activeGroupJids.size > 0) {
            await WhatsAppGroupRegistry.updateMany(
                {
                    integrationId,
                    groupJid: { $nin: Array.from(activeGroupJids) },
                    status: { $ne: 'INACTIVE' }
                },
                {
                    $set: {
                        permissionStatus: 'LEFT_OR_REMOVED',
                        status: 'INACTIVE',
                        lastVerifiedAt: now,
                        lastError: 'Account is no longer in this group'
                    }
                }
            );
        }

        return { count: bulkOps.length };
    }

    /**
     * Updates an individual group record from real-time events (groups.update, group-participants.update)
     */
    static async updateGroupFromEvent(integrationId, groupJid, updateData = {}) {
        if (!integrationId || !groupJid) return;
        const now = new Date();
        const setFields = { lastVerifiedAt: now };

        if (updateData.subject !== undefined) setFields.subject = updateData.subject;
        if (updateData.announce !== undefined) setFields.announce = Boolean(updateData.announce);
        if (updateData.restrict !== undefined) setFields.restrict = Boolean(updateData.restrict);
        if (updateData.participantCount !== undefined) setFields.participantCount = updateData.participantCount;
        if (updateData.permissionStatus !== undefined) setFields.permissionStatus = updateData.permissionStatus;
        if (updateData.status !== undefined) setFields.status = updateData.status;

        await WhatsAppGroupRegistry.updateOne(
            { integrationId, groupJid: String(groupJid).trim() },
            { $set: setFields },
            { upsert: false }
        );
    }

    /**
     * Fast read (<20ms) of sendable groups for UI selectors and campaign builders
     */
    static async getSendableGroups(integrationId) {
        if (!integrationId) return [];
        return await WhatsAppGroupRegistry.find({
            integrationId,
            status: 'ACTIVE',
            permissionStatus: 'CAN_SEND'
        }).lean();
    }

    /**
     * Pre-flight dispatch verification: guarantees a group is verified and sendable before external network I/O
     */
    static async validateGroupForDispatch(integrationId, groupJid) {
        if (!groupJid || !groupJid.endsWith('@g.us')) {
            return { allowed: true, isGroup: false };
        }

        const cleanJid = String(groupJid).trim();
        const record = await WhatsAppGroupRegistry.findOne({
            integrationId,
            groupJid: cleanJid
        }).lean();

        if (!record) {
            return {
                allowed: false,
                isGroup: true,
                permissionStatus: 'UNKNOWN',
                reason: `Group ${cleanJid} is not registered in the verified Group Registry for this account. Refresh group list before dispatching.`
            };
        }

        if (record.status === 'INACTIVE' || record.permissionStatus === 'LEFT_OR_REMOVED') {
            return {
                allowed: false,
                isGroup: true,
                permissionStatus: 'LEFT_OR_REMOVED',
                reason: `Sender account has left or was removed from group '${record.subject}'. Cannot dispatch.`
            };
        }

        if (record.permissionStatus === 'ADMIN_ONLY_RESTRICTED' || (record.announce && !record.senderIsAdmin)) {
            return {
                allowed: false,
                isGroup: true,
                permissionStatus: 'ADMIN_ONLY_RESTRICTED',
                reason: `Group '${record.subject}' is an Admin-only announcement group and the sender account is not an admin.`
            };
        }

        if (record.permissionStatus !== 'CAN_SEND') {
            return {
                allowed: false,
                isGroup: true,
                permissionStatus: record.permissionStatus,
                reason: `Group '${record.subject}' has unverified permission status (${record.permissionStatus}).`
            };
        }

        return {
            allowed: true,
            isGroup: true,
            permissionStatus: 'CAN_SEND',
            group: record
        };
    }
}

export default WhatsAppGroupRegistryService;
