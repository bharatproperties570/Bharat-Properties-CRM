import mongoose from 'mongoose';
import Lead from '../../models/Lead.js';

/**
 * Service to handle executing configured Triggers for Activity events (e.g. WhatsApp messages).
 * Extracts logic previously duplicated across multiple controllers.
 */
class ActivityTriggerService {
    /**
     * Evaluate and execute triggers for a specific activity event.
     * @param {Object} activity - The activity document
     * @param {Object} user - The req.user who triggered the event
     * @param {String} eventName - 'activity_created' or 'activity_completed'
     */
    static async executeActivityWhatsAppTriggers(activity, user, eventName) {
        try {
            const actTypeLC = (activity.type || '').trim().toLowerCase();
            
            // Optimization: Only specific types currently have WhatsApp templates
            if (!['site visit', 'meeting'].includes(actTypeLC)) {
                return;
            }

            const TriggerModel = mongoose.model('Trigger');
            const query = {
                module: 'activities', // MUST match enum in Trigger.js
                event: eventName,
                isActive: true
            };
            
            if (user?.companyId) {
                query.$or = [{ companyId: user.companyId }, { companyId: null }, { companyId: { $exists: false } }];
            }

            const activeTriggers = await TriggerModel.find(query);
            if (activeTriggers.length === 0) return;

            const entity = activity.entityId && activity.entityType?.toLowerCase() === 'lead' 
                ? await Lead.findById(activity.entityId) 
                : null;
                
            const recipientPhone = entity?.primaryPhone || entity?.mobile || null;
            if (!recipientPhone) return;

            for (const trigger of activeTriggers) {
                let shouldFire = false;
                if (trigger.conditions?.rules?.length > 0) {
                    shouldFire = trigger.conditions.rules.some(r => {
                        const ruleFieldLC = (r.field || '').trim().toLowerCase();
                        const ruleValLC = (r.value || '').toString().trim().toLowerCase();
                        return ruleFieldLC === 'type' && (ruleValLC === actTypeLC || ruleValLC.includes(actTypeLC));
                    });
                } else {
                    shouldFire = true;
                }

                if (shouldFire) {
                    for (const action of trigger.actions) {
                        if (action.type === 'send_communication' && action.channel === 'whatsapp') {
                            await this._dispatchWhatsAppMessage(action, activity, entity, recipientPhone, user, actTypeLC);
                        }
                    }
                }
            }
        } catch (triggerErr) {
            console.error('[ActivityTriggerService] Failed to execute mobile triggers:', triggerErr);
        }
    }

    static async _dispatchWhatsAppMessage(action, activity, entity, recipientPhone, user, actTypeLC) {
        try {
            let ownerName = 'Valued Client';
            if (entity) {
                const fn = entity.firstName || '';
                const ln = entity.lastName || '';
                const combined = `${fn} ${ln}`.trim();
                if (combined) {
                    ownerName = combined;
                } else if (entity.fullName && !entity.fullName.includes('null') && !entity.fullName.includes('undefined')) {
                    ownerName = entity.fullName;
                }
            }

            let rawLocation = activity.details?.location || activity.location || 'Site';
            let searchLocation = rawLocation;
            
            if (actTypeLC === 'site visit') {
                const hasUnit = activity.details?.visitedProperties && activity.details.visitedProperties.length > 0 && activity.details.visitedProperties[0].property;
                if (activity.details?.sendUnitLocation !== false && hasUnit) {
                    const prop = activity.details.visitedProperties[0];
                    rawLocation = `${prop.project || 'Project'} - Block ${prop.block || ''}, Unit ${prop.property}`;
                    searchLocation = `${prop.project || ''} ${prop.block || ''} Kurukshetra`;
                } else {
                    rawLocation = user?.preferences?.officeLocation || '166, Huda Market, Sector 3, Kurukshetra';
                    searchLocation = user?.preferences?.officeLocation || 'Bharat Properties Kurukshetra';
                }
            } else if (actTypeLC === 'meeting') {
                const meetType = activity.details?.meetingType || '';
                const meetLoc = activity.details?.meetingLocation || '';
                rawLocation = meetType ? `${meetType} - ${meetLoc}` : (meetLoc || 'Office');
                searchLocation = meetLoc || 'Bharat Properties Kurukshetra';
            }
            const locationLink = searchLocation ? `${rawLocation} (https://maps.google.com/?q=${encodeURIComponent(searchLocation)})` : rawLocation;

            let summaryText = activity.subject || activity.description || 'Discussion';
            if (actTypeLC === 'meeting' && activity.details?.agenda) {
                summaryText = activity.details.agenda;
            } else if (actTypeLC === 'site visit' && activity.details?.purpose) {
                summaryText = activity.details.purpose;
            } else if (activity.details?.agenda) {
                summaryText = activity.details.agenda;
            }

            const userName = user?.fullName || user?.name || user?.username || 'Suraj Keshwar';
            const userMobile = user?.mobile || user?.phone || '9999999999';
            
            const compDate = activity.completedAt || activity.updatedAt || activity.dueDate || new Date();
            const activityCompDateStr = new Date(compDate).toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
            });
            const activityTimeStr = new Date(compDate).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

            let meetingAgendaVal = activity.details?.agenda || activity.details?.agendaDiscussed || activity.details?.purpose || activity.subject || 'Meeting';
            let visitTypeVal = activity.details?.visitType || activity.details?.purpose || activity.type || 'Site Visit';

            // Exact Meta Approved Named Variable Registry
            const namedRegistry = {
                // Exact Meta Approved Template Variables
                'lead_name': ownerName,
                'activity_comp_date': activityCompDateStr,
                'meeting_agenda': meetingAgendaVal,
                'visit_type': visitTypeVal,
                'employee_name': userName,
                'employee_mobile': userMobile,

                // Aliases for CRM Variable Registry
                'OwnerName': ownerName,
                'ownername': ownerName,
                'full_name': ownerName,
                'first_name': ownerName.split(' ')[0],
                'last_name': ownerName.split(' ').slice(1).join(' ') || '',
                'ContactName': ownerName,
                'contactname': ownerName,
                'leadname': ownerName,

                'EmployeeName': userName,
                'employeename': userName,
                'agent_name': userName,
                'agentName': userName,
                'EmployeeMobile': userMobile,
                'employeemobile': userMobile,
                'agent_mobile': userMobile,

                'activity_type': activity.type,
                'activitytype': activity.type,
                'activity_date': activityCompDateStr,
                'date': activityCompDateStr,
                'activity_time': activityTimeStr,
                'time': activityTimeStr,
                'activity_location': locationLink,
                'location': locationLink,
                'DiscussionSummary': summaryText,
                'activity_summary': summaryText,
                'discussionsummary': summaryText,

                'projectname': activity.details?.project || 'our project',
                'project_name': activity.details?.project || 'our project',
                'unitnumber': activity.details?.unitNumber || activity.details?.property || '',
                'unit_number': activity.details?.unitNumber || activity.details?.property || '',
                'subcategory': activity.details?.subCategory || 'Property',
                'property_subcategory': activity.details?.subCategory || 'Property'
            };

            // Replace in local body text if needed
            let body = action.body || action.message || '';
            Object.keys(namedRegistry).forEach(key => {
                body = body.replaceAll(`{{${key}}}`, namedRegistry[key] || '');
                body = body.replaceAll(`{${key}}`, namedRegistry[key] || '');
            });

            // Send ONLY exact Named Parameters to Meta API
            const templateComponents = Object.keys(namedRegistry).map(key => ({
                parameter_name: key,
                text: String(namedRegistry[key] || '')
            }));

            // Mock req/res to call internal social controller without network overhead
            const { sendWhatsAppMessage } = await import('../../controllers/social.controller.js');
            const mockReq = {
                user: user,
                body: { 
                    mobile: recipientPhone, 
                    message: body, 
                    type: action.templateId ? 'template' : 'text', 
                    templateId: action.templateId,
                    templateComponents
                }
            };
            const mockRes = { status: () => mockRes, json: () => mockRes };
            
            await sendWhatsAppMessage(mockReq, mockRes, () => {}).catch(e => console.error('[ActivityTriggerService] Meta API err:', e.message));
            console.log(`[ActivityTriggerService] Dispatched WhatsApp (${actTypeLC}) to ${recipientPhone} by user ${userName}`);

        } catch (err) {
            console.error('[ActivityTriggerService] Message dispatch failed:', err);
        }
    }
}

export default ActivityTriggerService;
