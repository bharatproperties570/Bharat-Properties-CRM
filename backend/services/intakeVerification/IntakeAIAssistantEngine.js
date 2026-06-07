class IntakeAIAssistantEngine {
    
    /**
     * Analyzes the intake record and generates AI Assistant insights.
     * @param {Object} record - The parsed and verified intake record.
     * @returns {Object} AI assistant data to store in `ai_assistant` field.
     */
    analyze(record) {
        return {
            summary: this.generateSummary(record),
            seller_intent: this.identifySellerIntent(record),
            next_action: this.recommendNextAction(record),
            whatsapp_response: this.generateWhatsAppResponse(record),
            is_hot_deal: this.identifyHotDeal(record),
            urgency: this.estimateUrgency(record),
            verification_actions: this.recommendVerificationActions(record)
        };
    }

    generateSummary(record) {
        let summary = [];
        if (record.property_type && record.property_type !== 'Unknown') {
            summary.push(record.property_type);
        }
        if (record.size) {
            summary.push(record.size);
        }
        if (record.location && record.location !== 'Unspecified') {
            summary.push(`in ${record.location}`);
        }
        if (record.price) {
            summary.push(`listed at ${record.price}`);
        }
        
        if (summary.length > 0) {
            return summary.join(' ').replace(/\s+/g, ' ') + '.';
        }
        
        return "New property opportunity detected without key structural details.";
    }

    identifySellerIntent(record) {
        const text = (record.description || '').toLowerCase() + ' ' + (record.title || '').toLowerCase();
        
        if (text.includes('distress') || text.includes('urgent') || text.includes('must sell')) {
            return "Likely Distress Sale";
        }
        if (text.includes('broker') || text.includes('dealer') || text.includes('agency')) {
            return "Possible Broker / Syndicated";
        }
        if (text.includes('direct owner') || text.includes('my property') || text.includes('no broker')) {
            return "Direct Owner";
        }
        if (text.includes('tenant') || text.includes('yielding') || text.includes('rental income')) {
            return "Possible Investor Deal";
        }
        
        if (record.seller_intent === 'sell' || record.seller_intent === 'seller') {
            return "Standard Seller Listing";
        }
        if (record.seller_intent === 'rent' || record.seller_intent === 'landlord') {
            return "Standard Rental Listing";
        }
        if (record.seller_intent === 'lease') {
            return "Standard Lease Listing";
        }
        
        return "General Inquiry";
    }

    recommendNextAction(record) {
        if (this.identifyHotDeal(record) || this.estimateUrgency(record) === 'High') {
            return "Recommend immediate call";
        }
        
        if (!record.price || !record.size || !record.location) {
            return "Request missing details via WhatsApp";
        }
        
        if (record.verification_status === 'suspicious') {
            return "Manual Review Required";
        }

        return "Schedule standard follow-up";
    }

    generateWhatsAppResponse(record) {
        const propertyInfo = record.property_type ? `${record.property_type} in ${record.location || 'your area'}` : "your recent property listing";
        let message = `Hi, I noticed ${propertyInfo}. `;
        
        if (!record.price || !record.size) {
            message += "Could you please share some more details like the size and expected price? ";
        } else {
            message += "Is it still available for discussion? ";
        }
        
        message += "I have interested buyers looking in this segment. Let me know when is a good time to connect.";
        
        return message;
    }

    identifyHotDeal(record) {
        // High urgency implies a hot deal
        if (this.estimateUrgency(record) === 'High') return true;

        // If it's a below market probability (simplified heuristic based on price parsing if available)
        // Without full market data, we rely on keywords and confidence.
        const text = (record.description || '').toLowerCase();
        if (text.includes('below market') || text.includes('price drop') || text.includes('cheap')) {
            return true;
        }

        return false;
    }

    estimateUrgency(record) {
        const text = (record.description || '').toLowerCase();
        const highUrgency = ['urgent', 'immediate', 'distress', 'must sell', 'leaving city'];
        const mediumUrgency = ['soon', 'quick', 'motivated'];
        
        for (let word of highUrgency) {
            if (text.includes(word)) return 'High';
        }
        
        for (let word of mediumUrgency) {
            if (text.includes(word)) return 'Medium';
        }
        
        return 'Low';
    }

    recommendVerificationActions(record) {
        let actions = [];
        
        if (!record.price) actions.push("Verify Expected Price");
        if (!record.location) actions.push("Confirm Exact Location");
        if (record.verification_status === 'suspicious') actions.push("Cross-check Contact Number with Spam DB");
        if (record.duplicate_intelligence && record.duplicate_intelligence.duplicate_probability > 50) {
            actions.push("Check possible duplicates before acting");
        }
        
        if (actions.length === 0) {
            actions.push("No immediate verification needed. Good to proceed.");
        }
        
        return actions;
    }
}

export default new IntakeAIAssistantEngine();
