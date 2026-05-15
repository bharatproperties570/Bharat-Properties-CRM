import Intake from '../../models/Intake.js';
import duplicateIntelligenceEngine from './DuplicateIntelligenceEngine.js';

class AIVerificationEngine {
    
    /**
     * Run all verification rules against an intake record
     * @param {Object} intakeRecord 
     * @returns {Object} { status, confidence, notes, flags, duplicate_intelligence }
     */
    async verify(intakeRecord) {
        let confidenceScore = 100;
        const notes = [];
        const flags = [];
        let duplicate_intelligence = {};

        // 1. Missing Fields Detection
        const missingFields = this.detectMissingFields(intakeRecord);
        if (missingFields.length > 0) {
            confidenceScore -= (missingFields.length * 5); // penalty per missing core field
            notes.push(`Missing core fields: ${missingFields.join(', ')}`);
        } else {
            notes.push("All core fields present (High Completeness).");
        }

        // 2. Field Consistency & Suspicious Pricing
        const priceValidation = this.validatePricing(intakeRecord.price, intakeRecord.size);
        if (!priceValidation.isValid) {
            confidenceScore -= 30;
            flags.push('suspicious_pricing');
            notes.push(`Suspicious Pricing: ${priceValidation.reason}`);
        }

        // 3. Broker vs Owner Probability
        const actorAnalysis = this.detectBrokerVsOwner(intakeRecord);
        notes.push(`Identified as likely ${actorAnalysis.type} (${actorAnalysis.confidence}% confidence).`);
        if (actorAnalysis.type === 'Broker' && actorAnalysis.confidence > 80) {
            flags.push('probable_broker');
            confidenceScore -= 10; // Slight penalty for broker syndication in some business models
        }

        // 4. Urgency Signals
        const urgencyLevel = this.detectUrgencySignals(intakeRecord.description);
        if (urgencyLevel === 'High') {
            notes.push("High urgency signals detected in description.");
            flags.push('high_urgency');
        }

        // 5. Source Quality & Extraction Quality
        if (intakeRecord.source_confidence < 50) {
            confidenceScore -= 15;
            notes.push("Low source extraction confidence.");
        }

        // 6. Duplicate Risk (Using Duplicate Intelligence Engine)
        const duplicateAnalysis = await duplicateIntelligenceEngine.analyze(intakeRecord);
        duplicate_intelligence = duplicateAnalysis;

        if (duplicateAnalysis.duplicate_probability > 80) {
            confidenceScore -= 40;
            flags.push('high_duplicate_probability');
            notes.push(`High probability (${duplicateAnalysis.duplicate_probability}%) of being a duplicate.`);
            if (duplicateAnalysis.merge_suggestions.length > 0) {
                notes.push(`Merge suggestion: ${duplicateAnalysis.merge_suggestions[0]}`);
            }
        } else if (duplicateAnalysis.duplicate_probability > 50) {
            confidenceScore -= 15;
            notes.push(`Moderate duplicate risk (${duplicateAnalysis.duplicate_probability}%).`);
        }

        // Normalize Score
        confidenceScore = Math.max(0, Math.min(confidenceScore, 100));

        // Determine Status based on final score and flags
        let status = 'verified';
        if (confidenceScore < 40 || flags.includes('suspicious_pricing')) {
            status = 'suspicious';
        } else if (confidenceScore < 75 || flags.includes('probable_broker') || flags.includes('high_duplicate_probability')) {
            status = 'needs_review';
        }

        return {
            verification_status: status,
            confidence_score: confidenceScore,
            verification_notes: notes,
            risk_flags: flags,
            duplicate_intelligence: duplicate_intelligence
        };
    }

    detectMissingFields(record) {
        const missing = [];
        if (!record.location) missing.push('location');
        if (!record.property_type) missing.push('property_type');
        if (!record.price) missing.push('price');
        if (!record.contact_numbers || record.contact_numbers.length === 0) missing.push('contact_numbers');
        return missing;
    }

    validatePricing(priceStr, sizeStr) {
        if (!priceStr) return { isValid: true }; // Can't validate
        
        const priceStrLower = priceStr.toLowerCase();
        let numericPrice = parseFloat(priceStrLower.replace(/[^0-9.]/g, ''));
        
        // Convert Cr/Lac
        if (priceStrLower.includes('cr')) numericPrice *= 10000000;
        else if (priceStrLower.includes('lac') || priceStrLower.includes('lakh')) numericPrice *= 100000;
        
        if (numericPrice > 0 && numericPrice < 50000) {
            // Highly unlikely to buy/sell a property for < 50k unless it's rent
            return { isValid: false, reason: "Price is unusually low for sale property. Check if rental." };
        }
        if (numericPrice > 5000000000) { // > 500 Cr
            return { isValid: false, reason: "Price is astronomically high. Possible typo." };
        }
        
        return { isValid: true };
    }

    detectBrokerVsOwner(record) {
        const text = (record.description || '').toLowerCase();
        const brokerKeywords = ['broker', 'dealer', 'agency', 'commission', 'consultant', 'properties', 'real estate', 'realtor', 'associates'];
        const ownerKeywords = ['direct owner', 'no broker', 'no commission', 'my property', 'my flat'];
        
        let brokerScore = 0;
        let ownerScore = 0;

        brokerKeywords.forEach(kw => { if (text.includes(kw)) brokerScore += 20; });
        ownerKeywords.forEach(kw => { if (text.includes(kw)) ownerScore += 30; });

        // If contact numbers match known brokers (mock logic)
        // if (knownBrokersDb.includes(record.contact_numbers[0])) brokerScore += 50;

        if (brokerScore > ownerScore && brokerScore > 20) {
            return { type: 'Broker', confidence: Math.min(brokerScore + 30, 99) };
        } else if (ownerScore > brokerScore) {
            return { type: 'Owner', confidence: Math.min(ownerScore + 40, 99) };
        }
        return { type: 'Unknown', confidence: 50 };
    }

    detectUrgencySignals(description) {
        const text = (description || '').toLowerCase();
        const urgencyKeywords = ['urgent', 'immediate', 'distress', 'must sell', 'moving out', 'leaving city', 'desperate'];
        
        if (urgencyKeywords.some(kw => text.includes(kw))) {
            return 'High';
        }
        return 'Normal';
    }

}

export default new AIVerificationEngine();
