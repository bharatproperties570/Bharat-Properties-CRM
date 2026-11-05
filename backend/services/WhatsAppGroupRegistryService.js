import WhatsAppGroupRegistry from '../models/WhatsAppGroupRegistry.js';
import WhatsAppIntegration from '../models/WhatsAppIntegration.js';

export const GROUP_METADATA_MAX_AGE_MS = process.env.WHATSAPP_GROUP_METADATA_TTL_MS
    ? parseInt(process.env.WHATSAPP_GROUP_METADATA_TTL_MS, 10)
    : 24 * 60 * 60 * 1000; // 24-hour default freshness limit

export class WhatsAppGroupRegistryService {
    /**
     * Normalizes a phone number to standard 10-digit Indian mobile or clean digits for exact identity matching
     */
    static normalizeIdentityPhone(rawPhone) {
        if (!rawPhone) return null;
        const digits = String(rawPhone).replace(/\D/g, '');
        if (digits.length === 12 && digits.startsWith('91')) {
            return digits.slice(2);
        }
        if (digits.length === 11 && digits.startsWith('0')) {
            return digits.slice(1);
        }
        if (digits.length === 10) {
            return digits;
        }
        return digits.length > 0 ? digits : null;
    }

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
     * Determines whether a participant in Baileys group metadata matches the sender using EXACT identity matching.
     * Replaces unsafe endsWith() with strict normalized comparisons to prevent partial-digit collisions.
     */
    static isSenderParticipant(participant, senderPhone, senderLid) {
        if (!participant || !participant.id) return false;
        const rawId = String(participant.id).trim();
        const pDigits = rawId.split('@')[0].split(':')[0].replace(/\D/g, '');
        if (!pDigits) return false;

        const isLidParticipant = rawId.endsWith('@lid') || rawId.includes('@lid');
        if (isLidParticipant) {
            // Strict exact LID matching only
            return Boolean(senderLid && pDigits === senderLid);
        }

        // Standard phone matching: exact normalized comparison
        const normP = this.normalizeIdentityPhone(pDigits);
        const normSender = this.normalizeIdentityPhone(senderPhone);
        if (normP && normSender && normP === normSender) {
            return true;
        }

        return false;
    }

    /**
     * Evaluates permission status from group metadata and sender identifiers.
     * Note: announce controls message posting permissions; restrict controls group settings changes.
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
        // sender has left or been removed from this group
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

        // Announcement group: Only admins/superadmins can post messages
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
     * Protects existing groups if socket fetch fails or returns an empty result.
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
        // Safety guard: Empty/failed sync must NOT purge or deactivate all registered groups
        if (groupsList.length === 0) {
            console.warn(`[WhatsAppGroupRegistry] groupFetchAllParticipating returned empty list for integration ${integrationId}. Skipping registry purge to protect existing registered groups.`);
            return { count: 0, skippedPurge: true };
        }

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

        // Mark previously registered groups that are absent from participating list as LEFT_OR_REMOVED
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
        if (updateData.participantCount !== undefined) {
            setFields.participantCount = updateData.participantCount;
            // Refreshed participant count implies fresh metadata fetch
            setFields.metadataFetchedAt = now;
        }
        if (updateData.permissionStatus !== undefined) setFields.permissionStatus = updateData.permissionStatus;
        if (updateData.status !== undefined) setFields.status = updateData.status;

        await WhatsAppGroupRegistry.updateOne(
            { integrationId, groupJid: String(groupJid).trim() },
            { $set: setFields },
            { upsert: false }
        );
    }

    /**
     * Fast read (<20ms) of sendable groups for UI selectors and campaign builders.
     * Excludes stale records where metadata is older than GROUP_METADATA_MAX_AGE_MS.
     */
    static async getSendableGroups(integrationId) {
        if (!integrationId) return [];
        const freshnessThreshold = new Date(Date.now() - GROUP_METADATA_MAX_AGE_MS);
        return await WhatsAppGroupRegistry.find({
            integrationId,
            status: 'ACTIVE',
            permissionStatus: 'CAN_SEND',
            metadataFetchedAt: { $gte: freshnessThreshold }
        }).lean();
    }

    /**
     * Pre-flight dispatch verification: guarantees a group is registered, verified, fresh and sendable
     * before any external network socket transmission is initiated.
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

        // Validate metadata freshness limit
        const metadataAge = record.metadataFetchedAt
            ? (Date.now() - new Date(record.metadataFetchedAt).getTime())
            : Infinity;

        if (metadataAge > GROUP_METADATA_MAX_AGE_MS) {
            const ageHours = record.metadataFetchedAt ? Math.round(metadataAge / (1000 * 60 * 60)) : 'unrecorded';
            return {
                allowed: false,
                isGroup: true,
                permissionStatus: 'STALE_METADATA',
                reason: `Group '${record.subject}' metadata is stale (${ageHours}h old, limit ${Math.round(GROUP_METADATA_MAX_AGE_MS / (1000 * 60 * 60))}h). Refresh group list before dispatching.`
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
