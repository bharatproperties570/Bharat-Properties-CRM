import { contactData, leadData } from '../data/mockData';
import { calculateLeadScore } from '../utils/leadScoring';

/**
 * Service to handle Lead to Contact conversion logic
 */
class LeadConversionService {
    constructor() {
        this.conversionHistory = this.loadHistory();
    }

    loadHistory() {
        const history = localStorage.getItem('lead_conversion_history');
        return history ? JSON.parse(history) : {};
    }

    saveHistory(history) {
        localStorage.setItem('lead_conversion_history', JSON.stringify(history));
        this.conversionHistory = history;
    }

    /**
     * Checks if a lead has already been converted
     */
    isConverted(mobile) {
        return !!this.conversionHistory[mobile];
    }

    checkDuplicate(lead) {
        return contactData.find(c =>
            c.mobile === lead.mobile ||
            (lead.email && c.email === lead.email)
        ) || null;
    }

    /**
     * Core conversion logic
     */
    convertLead(lead, ruleTriggered = 'Manual') {
        if (this.isConverted(lead.mobile)) {
            return { success: false, message: 'Lead already converted' };
        }

        const duplicate = this.checkDuplicate(lead);
        if (duplicate) {
            return {
                success: false,
                requiresMerge: true,
                duplicate,
                message: 'A similar contact already exists.'
            };
        }

        const scoring = calculateLeadScore(lead, lead.activities || []);

        // Prepare new contact data
        const newContact = {
            ...lead,
            id: lead.mobile,
            category: 'Prospect',
            tags: `${lead.tags || ''}, Converted Lead`.replace(/^, /, ''),
            conversionMeta: {
                date: new Date().toLocaleDateString('en-GB'),
                scoreAtConversion: scoring.total,
                source: lead.source,
                trigger: ruleTriggered
            },
            remarks: `(Converted at Score: ${scoring.total}) | ${ruleTriggered} | ${lead.remarks}`
        };

        const history = { ...this.conversionHistory };
        history[lead.mobile] = {
            convertedAt: new Date().toISOString(),
            contactId: lead.mobile,
            trigger: ruleTriggered,
            score: scoring.total
        };
        this.saveHistory(history);

        return {
            success: true,
            contact: newContact,
            message: `Lead ${lead.name} converted to Contact successfully (Score: ${scoring.total})!`
        };
    }

    /**
     * Auto-conversion trigger check
     */
    evaluateAutoConversion(lead, eventType, eventData = {}) {
        const scoring = calculateLeadScore(lead, lead.activities || []);

        // Official PDF Rule: Score >= 60 -> Eligible for Contact auto-conversion
        if (eventType === 'call_logged' && eventData.status === 'connected') {
            if (scoring.total >= 60) {
                return this.convertLead(lead, 'AI Scoring: High Engagement Conversion');
            }
        }

        // Rule B: High Intent Actions
        if (eventType === 'site_visit_scheduled' || eventType === 'property_shortlisted') {
            if (scoring.total >= 50) { // Slight buffer for high intent
                return this.convertLead(lead, 'AI Scoring: High Intent Action Conversion');
            }
        }

        return { success: false, autoTriggered: false };
    }
}

export default new LeadConversionService();
