import re

filepath = 'backend/src/services/StageTransitionEngine.js'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

new_rules = """
    // ══════════════════════════════════════════════════════════
    //  NEW OUTCOMES (PHASE 3)
    // ══════════════════════════════════════════════════════════
    {
        id: 'visit_cancelled',
        activityType: 'Site Visit',
        purpose: '*',
        outcome: 'Visit Cancelled',
        reason: '*',
        newStage: 'Prospect',
        requiredForms: [],
        priority: 10,
        active: true
    },
    {
        id: 'visit_no_show',
        activityType: 'Site Visit',
        purpose: '*',
        outcome: 'No Show',
        reason: '*',
        newStage: 'Prospect',
        requiredForms: [],
        priority: 10,
        active: true
    },
    {
        id: 'visit_rescheduled',
        activityType: 'Site Visit',
        purpose: '*',
        outcome: 'Visit Rescheduled',
        reason: '*',
        newStage: 'Prospect',
        requiredForms: [],
        priority: 10,
        active: true
    },
    {
        id: 'call_voicemail_left',
        activityType: 'Call',
        purpose: '*',
        outcome: 'Voicemail Left',
        reason: '*',
        newStage: 'Incoming',
        requiredForms: [],
        priority: 10,
        active: true
    },
    {
        id: 'call_qualifying_very_interested',
        activityType: 'Call',
        purpose: 'Qualifying',
        outcome: 'Connected',
        reason: 'Very Interested',
        newStage: 'Qualified',
        requiredForms: [],
        priority: 15,
        active: true
    },
    {
        id: 'call_intro_very_interested',
        activityType: 'Call',
        purpose: 'Introduction / First Contact',
        outcome: 'Connected',
        reason: 'Very Interested',
        newStage: 'Qualified',
        requiredForms: [],
        priority: 15,
        active: true
    },
    {
        id: 'meeting_cancelled',
        activityType: 'Meeting',
        purpose: '*',
        outcome: 'Meeting Cancelled',
        reason: '*',
        newStage: 'Prospect',
        requiredForms: [],
        priority: 10,
        active: true
    },
    {
        id: 'meeting_demo_interested',
        activityType: 'Meeting',
        purpose: 'Demo Given',
        outcome: 'Conducted',
        reason: 'Interested',
        newStage: 'Opportunity',
        requiredForms: [],
        priority: 20,
        active: true
    },
    {
        id: 'digital_replied_not_interested',
        activityType: 'Email', // or WhatsApp, we'll use * 
        purpose: '*',
        outcome: 'Replied',
        reason: 'Not Interested',
        newStage: 'Closed',
        requiredForms: [],
        priority: 30,
        active: true
    },
    {
        id: 'digital_bounced',
        activityType: 'Email',
        purpose: '*',
        outcome: 'Bounced',
        reason: '*',
        newStage: 'Incoming',
        requiredForms: [],
        priority: 30,
        active: true
    },
    {
        id: 'digital_whatsapp_blocked',
        activityType: 'WhatsApp',
        purpose: '*',
        outcome: 'Blocked',
        reason: '*',
        newStage: 'Closed',
        requiredForms: [],
        priority: 30,
        active: true
    },
"""

# Insert right after `export const DEFAULT_STAGE_RULES = [`
if 'export const DEFAULT_STAGE_RULES = [' in content:
    content = content.replace('export const DEFAULT_STAGE_RULES = [', 'export const DEFAULT_STAGE_RULES = [' + new_rules)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Rules appended successfully")
else:
    print("Could not find DEFAULT_STAGE_RULES array")

