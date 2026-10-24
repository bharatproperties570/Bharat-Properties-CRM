import mongoose from 'mongoose';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import Activity from '../../../models/Activity.js';
import Inventory from '../../../models/Inventory.js';
import Lead from '../../../models/Lead.js';
import FeedbackForm from '../../../models/FeedbackForm.js';
import FeedbackSubmission from '../../../models/FeedbackSubmission.js';
import SiteVisitAutomationService from './siteVisitAutomation.service.js';
import { autoTriggerStageChange } from '../../../controllers/activity.controller.js';

async function safeExecLean(queryOrPromise) {
    if (!queryOrPromise) return null;
    if (typeof queryOrPromise.lean === 'function') {
        return queryOrPromise.lean().catch(() => null);
    }
    return Promise.resolve(queryOrPromise).catch(() => null);
}

export class SiteVisitJourneyService {
    /**
     * Resolves secret key for journey token signing and verification.
     * Fails closed if no secret is configured.
     */
    static getSecret() {
        const secret = process.env.FEEDBACK_JWT_SECRET || process.env.JWT_SECRET;
        if (!secret) {
            throw new Error('JWT Secret is not configured: Client journey security requires a valid secret.');
        }
        return secret;
    }

    /**
     * Generate a signed, time-limited, revocable client journey token.
     * Tokens are valid for 72 hours (3 days) to accommodate pre-visit itinerary viewing.
     */
    static generateJourneyToken(activity) {
        if (!activity || !activity._id) {
            throw new Error('Valid activity is required to generate journey token');
        }

        const secret = this.getSecret();
        const jti = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
        const activityId = String(activity._id);
        const leadId = String(activity.entityId || activity.lead || '');
        const baseUrl = process.env.FRONTEND_URL || 'https://bharatproperties.co';

        const token = jwt.sign(
            {
                iss: 'bharat-properties-crm',
                leadId,
                activityId,
                purpose: 'client_site_visit_journey',
                jti
            },
            secret,
            { expiresIn: '72h' }
        );

        // Safe tilde replacement for WhatsApp URL preview preservation (. -> ~)
        const safeToken = token.replace(/\./g, '~');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const journeyUrl = `${baseUrl}/journey/${safeToken}`;
        const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);

        return {
            token,
            safeToken,
            tokenHash,
            jti,
            journeyUrl,
            expiresAt
        };
    }

    /**
     * Decode, verify cryptographic signature, hash match, and revocation status of journey token.
     */
    static async verifyJourneyToken(rawToken) {
        if (!rawToken || typeof rawToken !== 'string') {
            throw new Error('Journey token is required');
        }

        const normalizedToken = rawToken.replace(/~/g, '.');
        const secret = this.getSecret();

        let decoded;
        try {
            decoded = jwt.verify(normalizedToken, secret);
        } catch (err) {
            const error = new Error('Invalid or expired journey token');
            error.statusCode = 403;
            throw error;
        }

        if (decoded.purpose !== 'client_site_visit_journey') {
            const error = new Error('Unauthorized token purpose');
            error.statusCode = 403;
            throw error;
        }

        const tokenHash = crypto.createHash('sha256').update(normalizedToken).digest('hex');
        const ActivityModel = mongoose.models.Activity || Activity;

        let activity = null;
        if (typeof ActivityModel.findById === 'function') {
            activity = await ActivityModel.findById(decoded.activityId);
        }

        if (!activity) {
            const error = new Error('Site visit activity not found');
            error.statusCode = 404;
            throw error;
        }

        if (activity.type !== 'Site Visit') {
            const error = new Error('Activity is not a Site Visit');
            error.statusCode = 400;
            throw error;
        }

        if (activity.status === 'Cancelled') {
            const error = new Error('This site visit has been cancelled');
            error.statusCode = 410; // Gone
            throw error;
        }

        if (activity.details?.journeyRevoked === true) {
            const error = new Error(activity.details?.journeyRevokedReason || 'This site visit journey link has been revoked');
            error.statusCode = 403;
            throw error;
        }

        // Verify stored hash matches (prevent replay of obsolete revoked tokens)
        if (activity.details?.journeyTokenHash && activity.details.journeyTokenHash !== tokenHash) {
            const error = new Error('Journey link has been superseded or refreshed');
            error.statusCode = 403;
            throw error;
        }

        return {
            activity,
            claims: decoded,
            tokenHash
        };
    }

    /**
     * Build Google Maps navigation intent URL.
     * Uses universal driving intent scheme with zero API key exposure to browser.
     */
    static buildNavigationUrl(property, inventory = null) {
        const lat = Number(inventory?.latitude || inventory?.geoPoint?.coordinates?.[1] || property?.lat);
        const lng = Number(inventory?.longitude || inventory?.geoPoint?.coordinates?.[0] || property?.lng);

        if (!Number.isNaN(lat) && !Number.isNaN(lng) && lat !== 0 && lng !== 0) {
            return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
        }

        const addressParts = [];
        if (property?.project) addressParts.push(property.project);
        if (inventory?.sector) addressParts.push(inventory.sector);
        if (inventory?.city) addressParts.push(inventory.city);
        if (property?.block) addressParts.push(property.block);

        const cleanAddress = addressParts.join(', ') || property?.project || 'Site Location';
        return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(cleanAddress)}&travelmode=driving`;
    }

    /**
     * Compute sequential unlocking status and sanitize property projections.
     * Strictly enforces:
     * - Property 0 is READY (or FEEDBACK_SUBMITTED)
     * - Property k is READY only if Property k-1 is FEEDBACK_SUBMITTED
     * - Later properties are LOCKED with sensitive details masked
     * - Zero owner contacts, commissions, or internal notes exposed
     */
    static async getSanitizedItinerary(activity) {
        const rawVisited = Array.isArray(activity.details?.visitedProperties)
            ? activity.details.visitedProperties
            : [];

        const InventoryModel = mongoose.models.Inventory || Inventory;
        const LeadModel = mongoose.models.Lead || Lead;

        // Fetch salesperson info
        let salesperson = { name: activity.performedBy || 'Property Consultant', mobile: '' };
        if (activity.assignedTo) {
            try {
                const UserModel = mongoose.models.User;
                if (UserModel && typeof UserModel.findById === 'function' && (mongoose.connection?.readyState === 1 || UserModel.findById !== mongoose.Model.findById)) {
                    const agent = await UserModel.findById(activity.assignedTo).select('fullName name mobile').lean().catch(() => null);
                    if (agent) {
                        salesperson = {
                            name: agent.fullName || agent.name || salesperson.name,
                            mobile: agent.mobile || ''
                        };
                    }
                }
            } catch (_) {}
        }

        // Fetch lead name
        let clientName = 'Valued Client';
        if (activity.entityId) {
            try {
                if (typeof LeadModel.findById === 'function' && (mongoose.connection?.readyState === 1 || LeadModel.findById !== mongoose.Model.findById)) {
                    const leadDoc = await LeadModel.findById(activity.entityId).select('name firstName lastName').lean().catch(() => null);
                    if (leadDoc) {
                        clientName = leadDoc.name || `${leadDoc.firstName || ''} ${leadDoc.lastName || ''}`.trim() || clientName;
                    }
                }
            } catch (_) {}
        }

        // Compute authoritative sequential statuses
        let completedCount = 0;
        let activeUnlockedIndex = -1;

        const orderedProperties = rawVisited.map((prop, idx) => {
            const order = typeof prop.order === 'number' ? prop.order : idx;
            return { ...prop, order };
        }).sort((a, b) => a.order - b.order);

        // Pre-scan completion statuses to determine gate unlocking
        for (let i = 0; i < orderedProperties.length; i++) {
            const p = orderedProperties[i];
            const isSubmitted = p.status === 'FEEDBACK_SUBMITTED' || Boolean(p.feedbackSubmissionId) || Boolean(p.clientRating);
            if (isSubmitted) {
                completedCount++;
            } else if (activeUnlockedIndex === -1) {
                activeUnlockedIndex = i; // First incomplete property is READY
            }
        }

        // Collect inventory IDs for batch fetching
        const inventoryIds = orderedProperties
            .map(p => p.inventoryId)
            .filter(id => id && mongoose.Types.ObjectId.isValid(id));

        const inventoryMap = new Map();
        if (inventoryIds.length > 0 && typeof InventoryModel.find === 'function' && (mongoose.connection?.readyState === 1 || InventoryModel.find !== mongoose.Model.find)) {
            try {
                const inventories = await InventoryModel.find({ _id: { $in: inventoryIds } })
                    .select('projectName project block unitNo unitNumber category size price totalCost allInclusivePrice facing direction roadWidth latitude longitude geoPoint inventoryImages city sector address')
                    .lean()
                    .catch(() => []);
                inventories.forEach(inv => inventoryMap.set(String(inv._id), inv));
            } catch (_) {}
        }

        const sanitizedProperties = orderedProperties.map((prop, idx) => {
            const isSubmitted = prop.status === 'FEEDBACK_SUBMITTED' || Boolean(prop.feedbackSubmissionId) || Boolean(prop.clientRating);
            const isReady = !isSubmitted && (idx === activeUnlockedIndex || (idx === 0 && completedCount === 0));
            const isNavigated = isReady && prop.status === 'NAVIGATED';
            const isLocked = !isSubmitted && !isReady && !isNavigated;

            const inv = prop.inventoryId ? inventoryMap.get(String(prop.inventoryId)) : null;

            // Formatted price
            let priceFormatted = null;
            const priceVal = inv?.totalCost?.value || inv?.price?.value || inv?.allInclusivePrice?.value;
            if (priceVal) {
                priceFormatted = priceVal >= 10000000
                    ? `₹ ${(priceVal / 10000000).toFixed(2)} Cr`
                    : `₹ ${(priceVal / 100000).toFixed(2)} Lac`;
            }

            // Formatted size
            let sizeFormatted = null;
            if (inv?.size?.value) {
                sizeFormatted = `${inv.size.value} ${inv.size.unit || 'Sq.Ft.'}`;
            }

            // Sanitized photos
            const images = (inv?.inventoryImages || [])
                .map(img => (typeof img === 'string' ? img : img?.url))
                .filter(Boolean);

            // Compute navigation intent URL
            const navigationUrl = isLocked ? null : this.buildNavigationUrl(prop, inv);

            if (isLocked) {
                // Strictly masked projection for locked properties
                return {
                    order: prop.order,
                    inventoryId: prop.inventoryId ? String(prop.inventoryId) : null,
                    project: prop.project || inv?.projectName || inv?.project || 'Scheduled Property',
                    unit: 'Unit Details Locked',
                    status: 'LOCKED',
                    isLocked: true,
                    location: {
                        city: inv?.city || prop.city || 'Gurugram',
                        navigationUrl: null
                    }
                };
            }

            // Unlocked or Completed projection
            return {
                order: prop.order,
                inventoryId: prop.inventoryId ? String(prop.inventoryId) : null,
                project: prop.project || inv?.projectName || inv?.project || 'Selected Project',
                block: prop.block || inv?.block || '',
                unit: prop.property || inv?.unitNo || inv?.unitNumber || '',
                status: isSubmitted ? 'FEEDBACK_SUBMITTED' : (isNavigated ? 'NAVIGATED' : 'READY'),
                isLocked: false,
                category: inv?.category || 'Residential',
                size: sizeFormatted,
                price: priceFormatted,
                facing: inv?.facing || '',
                direction: inv?.direction || '',
                roadWidth: inv?.roadWidth ? `${inv.roadWidth} Meter` : '',
                images: images.length > 0 ? images : ['https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=800&q=80'],
                location: {
                    address: inv?.sector ? `${inv.sector}, ${inv.city || 'Gurugram'}` : (inv?.city || 'Gurugram'),
                    lat: Number(inv?.latitude) || inv?.geoPoint?.coordinates?.[1] || null,
                    lng: Number(inv?.longitude) || inv?.geoPoint?.coordinates?.[0] || null,
                    navigationUrl
                },
                clientRating: prop.clientRating || null,
                clientInterest: prop.clientInterest || null,
                clientComments: prop.clientComments || null,
                navigatedAt: prop.navigatedAt || null,
                feedbackAt: prop.feedbackAt || null
            };
        });

        const isJourneyCompleted = completedCount === orderedProperties.length && orderedProperties.length > 0;

        return {
            journeyId: String(activity._id),
            visitDate: activity.dueDate,
            visitTime: activity.dueTime,
            status: activity.status,
            clientName,
            salesperson,
            totalProperties: orderedProperties.length,
            completedCount,
            currentIndex: activeUnlockedIndex !== -1 ? activeUnlockedIndex : (isJourneyCompleted ? orderedProperties.length - 1 : 0),
            isCompleted: isJourneyCompleted,
            properties: sanitizedProperties
        };
    }

    /**
     * Record client audit event when "Navigate" button is tapped.
     */
    static async recordNavigation(activityId, propertyIdentifier) {
        const ActivityModel = mongoose.models.Activity || Activity;
        const activity = await ActivityModel.findById(activityId);
        if (!activity) {
            const err = new Error('Activity not found');
            err.statusCode = 404;
            throw err;
        }

        const visitedProperties = Array.isArray(activity.details?.visitedProperties)
            ? activity.details.visitedProperties
            : [];

        const targetIndex = visitedProperties.findIndex((p, idx) => {
            if (p.inventoryId && String(p.inventoryId) === String(propertyIdentifier)) return true;
            if (String(p.order) === String(propertyIdentifier)) return true;
            if (String(idx) === String(propertyIdentifier)) return true;
            return false;
        });

        if (targetIndex === -1) {
            const err = new Error('Property not found in site visit itinerary');
            err.statusCode = 404;
            throw err;
        }

        const property = visitedProperties[targetIndex];
        if (property.status === 'LOCKED') {
            const err = new Error('Cannot navigate to a locked property');
            err.statusCode = 403;
            throw err;
        }

        if (property.status !== 'FEEDBACK_SUBMITTED') {
            property.status = 'NAVIGATED';
            property.navigatedAt = new Date();
        }

        if (typeof activity.save === 'function') {
            await activity.save();
        }

        return {
            success: true,
            propertyIndex: targetIndex,
            property
        };
    }

    /**
     * Submit per-property customer feedback along the journey.
     * Enforces:
     * - Property must be currently READY or NAVIGATED (cannot submit feedback on locked properties)
     * - Deterministic per-property idempotency key bound to (activityId, propertyIdentifier)
     * - Stores FeedbackSubmission document linked to specific inventory
     * - Advances sequential gate: Property i becomes FEEDBACK_SUBMITTED, Property i+1 becomes READY
     * - Triggers downstream business rules (intent score boost, manager escalation) exactly once
     * - Triggers journey completion and activity completion when last property is submitted
     */
    static async submitPropertyFeedback(activityId, propertyIdentifier, feedbackPayload, options = {}) {
        const { rating, interest, comments = '', rejectionReason = '', revisitRequested = false, expectedPrice } = feedbackPayload;

        const numRating = Number(rating);
        if (Number.isNaN(numRating) || numRating < 1 || numRating > 5) {
            const err = new Error('Rating must be an integer between 1 and 5');
            err.statusCode = 400;
            throw err;
        }

        const ActivityModel = mongoose.models.Activity || Activity;
        const FeedbackSubmissionModel = mongoose.models.FeedbackSubmission || FeedbackSubmission;
        const FeedbackFormModel = mongoose.models.FeedbackForm || FeedbackForm;
        const LeadModel = mongoose.models.Lead || Lead;

        const activity = await ActivityModel.findById(activityId);
        if (!activity) {
            const err = new Error('Activity not found');
            err.statusCode = 404;
            throw err;
        }

        if (activity.status === 'Cancelled') {
            const err = new Error('This site visit has been cancelled');
            err.statusCode = 410;
            throw err;
        }

        const visitedProperties = Array.isArray(activity.details?.visitedProperties)
            ? activity.details.visitedProperties
            : [];

        const targetIndex = visitedProperties.findIndex((p, idx) => {
            if (p.inventoryId && String(p.inventoryId) === String(propertyIdentifier)) return true;
            if (String(p.order) === String(propertyIdentifier)) return true;
            if (String(idx) === String(propertyIdentifier)) return true;
            return false;
        });

        if (targetIndex === -1) {
            const err = new Error('Property not found in site visit itinerary');
            err.statusCode = 404;
            throw err;
        }

        const property = visitedProperties[targetIndex];

        // 1. Enforce Sequential Gate: Cannot submit feedback on a locked property
        // Assert all prior properties have completed feedback
        for (let i = 0; i < targetIndex; i++) {
            const prior = visitedProperties[i];
            const priorCompleted = prior.status === 'FEEDBACK_SUBMITTED' || Boolean(prior.feedbackSubmissionId) || Boolean(prior.clientRating);
            if (!priorCompleted) {
                const err = new Error(`Cannot submit feedback for Property ${targetIndex + 1}. Please submit feedback for Property ${i + 1} (${prior.project}) first.`);
                err.statusCode = 403;
                throw err;
            }
        }

        const inventoryId = property.inventoryId ? String(property.inventoryId) : null;
        const propertyKey = inventoryId || `idx_${targetIndex}`;
        const idempotencyKey = `journey:${activity._id}:property:${propertyKey}`;

        // 2. Idempotency Check: Return existing submission if already submitted
        if (property.status === 'FEEDBACK_SUBMITTED' || property.feedbackSubmissionId) {
            let existingSubmission = null;
            if (typeof FeedbackSubmissionModel.findOne === 'function' && (mongoose.connection?.readyState === 1 || FeedbackSubmissionModel.findOne !== mongoose.Model.findOne)) {
                existingSubmission = await safeExecLean(FeedbackSubmissionModel.findOne({ idempotencyKey }));
            }
            return {
                success: true,
                duplicate: true,
                submission: existingSubmission || { _id: property.feedbackSubmissionId },
                message: 'Feedback for this property has already been recorded.'
            };
        }

        // 3. Resolve Feedback Form
        let formDoc = null;
        if (typeof FeedbackFormModel.findOne === 'function' && (mongoose.connection?.readyState === 1 || FeedbackFormModel.findOne !== mongoose.Model.findOne)) {
            formDoc = await safeExecLean(FeedbackFormModel.findOne({ slug: 'customer-experience-feedback-qx9z2', isActive: true }));
            if (!formDoc) {
                formDoc = await safeExecLean(FeedbackFormModel.findOne({ isActive: true }));
            }
        }
        const formId = formDoc?._id || new mongoose.Types.ObjectId();

        // 4. Persist FeedbackSubmission
        let submission = null;
        const submissionPayload = {
            form: formId,
            lead: activity.entityId || null,
            activity: activity._id,
            inventory: (inventoryId && mongoose.Types.ObjectId.isValid(inventoryId)) ? inventoryId : null,
            department: activity.department,
            teams: activity.teams,
            rating: numRating,
            idempotencyKey,
            responses: {
                overallRating: numRating,
                interest: interest || 'Interested',
                comments: comments || '',
                rejectionReason: rejectionReason || '',
                revisitRequested: Boolean(revisitRequested),
                expectedPrice: expectedPrice ? Number(expectedPrice) : null,
                project: property.project,
                unit: property.property
            },
            sourceMeta: options.sourceMeta || {}
        };

        try {
            if (options.session) {
                const created = await FeedbackSubmissionModel.create([submissionPayload], { session: options.session });
                submission = Array.isArray(created) ? created[0] : created;
            } else {
                submission = await FeedbackSubmissionModel.create(submissionPayload);
            }
        } catch (createErr) {
            if (createErr.code === 11000) {
                // Duplicate submission race winner
                const existing = await safeExecLean(FeedbackSubmissionModel.findOne({ idempotencyKey }));
                return {
                    success: true,
                    duplicate: true,
                    submission: existing,
                    message: 'Feedback for this property has already been recorded.'
                };
            }
            throw createErr;
        }

        // 5. Update Current Property State
        property.status = 'FEEDBACK_SUBMITTED';
        property.clientRating = numRating;
        property.clientInterest = interest || 'Interested';
        property.clientComments = comments || '';
        property.rejectionReason = rejectionReason || '';
        property.revisitRequested = Boolean(revisitRequested);
        property.feedbackAt = new Date();
        property.feedbackSubmissionId = submission._id;
        property.result = interest || 'Interested';

        // 6. Gate Advancement: Unlock Next Property
        const nextIndex = targetIndex + 1;
        let nextPropertyUnlocked = false;
        let isJourneyCompleted = false;

        if (nextIndex < visitedProperties.length) {
            const nextProp = visitedProperties[nextIndex];
            if (nextProp.status === 'LOCKED') {
                nextProp.status = 'READY';
                nextProp.unlockedAt = new Date();
                nextPropertyUnlocked = true;
            }
        } else {
            // Final property completed: Complete overall journey
            isJourneyCompleted = true;
            activity.details.journeyCompletedAt = new Date();
            activity.status = 'Completed';
            activity.completedAt = new Date();
            activity.completionResult = 'Customer Feedback Received';
            activity.performedBy = 'Customer (Mobile Journey)';
        }

        // Tag Activity
        if (!Array.isArray(activity.tags)) activity.tags = [];
        if (!activity.tags.includes('Customer-Feedback-Received')) {
            activity.tags.push('Customer-Feedback-Received');
        }
        if (numRating >= 4 && !activity.tags.includes('High-Satisfaction')) {
            activity.tags.push('High-Satisfaction');
        }

        try {
            if (typeof activity.save === 'function') {
                const saveOpts = options.session ? { session: options.session } : undefined;
                await activity.save(saveOpts);
            }
        } catch (saveErr) {
            // Rollback compensation in non-transactional mode
            if (!options.session && submission?._id && typeof FeedbackSubmissionModel.findByIdAndDelete === 'function') {
                try {
                    await FeedbackSubmissionModel.findByIdAndDelete(submission._id);
                } catch (_) {}
            }
            throw saveErr;
        }

        // 7. Downstream Automations (Executed strictly once on accepted submission)
        const leadId = activity.entityId;

        // Intent Score Boost on Positive Rating (>= 4)
        if (numRating >= 4 && leadId && mongoose.Types.ObjectId.isValid(leadId)) {
            try {
                if (typeof LeadModel.findByIdAndUpdate === 'function' && (mongoose.connection?.readyState === 1 || LeadModel.findByIdAndUpdate !== mongoose.Model.findByIdAndUpdate)) {
                    await LeadModel.findByIdAndUpdate(leadId, {
                        $inc: { intent_index: 10 },
                        $set: { lastFeedbackReceivedAt: new Date(), latestFeedbackRating: numRating }
                    }).catch(() => {});
                }
            } catch (_) {}
        }

        // Manager Escalation on Negative Rating (<= 2)
        if (numRating <= 2) {
            try {
                await SiteVisitAutomationService.escalateNegativeFeedback(
                    activity,
                    numRating,
                    `[Property: ${property.project} ${property.property || ''}] ${comments || rejectionReason || 'Low property rating'}`
                );
            } catch (escErr) {
                console.warn('[SiteVisitJourney] Escalation service warning:', escErr.message);
            }
        }

        // Revisit Request: Create Follow-up Task for Assigned Advisor
        if (revisitRequested && activity.assignedTo) {
            try {
                if (typeof ActivityModel.create === 'function') {
                    await ActivityModel.create({
                        type: 'Task',
                        subject: `Follow-up: Revisit requested for ${property.project} - ${property.property || 'Unit'}`,
                        entityType: 'Lead',
                        entityId: leadId,
                        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // Due in 24h
                        dueTime: '11:00 AM',
                        priority: 'High',
                        assignedTo: activity.assignedTo,
                        description: `Client requested a revisit for ${property.project}. Customer comments: "${comments || 'No comments'}".`,
                        tags: ['Site-Visit-Revisit-Request'],
                        details: {
                            sourceActivityId: activity._id,
                            inventoryId: property.inventoryId,
                            project: property.project,
                            property: property.property
                        }
                    }).catch(() => {});
                }
            } catch (_) {}
        }

        // Overall Stage Advancement on Journey Completion
        if (isJourneyCompleted && mongoose.connection?.readyState === 1) {
            try {
                autoTriggerStageChange(activity).catch(() => {});
            } catch (_) {}
        }

        return {
            success: true,
            submission,
            property,
            nextPropertyUnlocked,
            isJourneyCompleted,
            message: nextPropertyUnlocked
                ? `Feedback recorded! Next property (${visitedProperties[nextIndex]?.project}) is now unlocked.`
                : 'Thank you! You have completed your site visit journey.'
        };
    }
}

export default SiteVisitJourneyService;
