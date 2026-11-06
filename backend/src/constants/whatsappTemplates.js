/**
 * Meta WhatsApp Business API Template Registry
 * Phase 18.3: Dedicated Site Visit Journey Confirmation Template Specification
 */

export const META_TEMPLATES = {
    SITE_VISIT_JOURNEY_CONFIRMATION: {
        id: 'site_visit_journey_confirmation',
        name: 'site_visit_journey_confirmation',
        category: 'UTILITY',
        language: 'en',
        status: 'SUBMISSION_PREPARED', // Never claim Meta approval without official provider approval evidence
        headerType: 'NONE',
        body: `Namaste {{1}} ji,\n\nAapki property site visit successfully confirm ho gayi hai.\n\nVisit Date: {{2}}\nVisit Time: {{3}}\n\nAapki personalized property itinerary, property photos aur Google Maps navigation details dekhne ke liye neeche diye gaye button par click karein.\n\nRegards,\nBharat Properties`,
        footer: 'Bharat Properties • Verified Itinerary',
        buttons: [
            {
                type: 'URL',
                text: 'View Visit Journey',
                url: 'https://crm.bharatproperties.co/journey/{{1}}',
                url_type: 'DYNAMIC',
                example: [
                    'https://crm.bharatproperties.co/journey/header~payload~signature'
                ]
            }
        ],
        rawComponents: [
            {
                type: 'BODY',
                text: 'Namaste {{1}} ji,\n\nAapki property site visit successfully confirm ho gayi hai.\n\nVisit Date: {{2}}\nVisit Time: {{3}}\n\nAapki personalized property itinerary, property photos aur Google Maps navigation details dekhne ke liye neeche diye gaye button par click karein.\n\nRegards,\nBharat Properties',
                example: {
                    body_text: [
                        ['Rajesh Kumar', '15 Nov 2026', '11:30 AM']
                    ]
                }
            },
            {
                type: 'BUTTONS',
                buttons: [
                    {
                        type: 'URL',
                        text: 'View Visit Journey',
                        url: 'https://crm.bharatproperties.co/journey/{{1}}',
                        example: [
                            'header~payload~signature'
                        ]
                    }
                ]
            }
        ],
        parameterMapping: {
            '{{1}}': 'lead_name / client_name',
            '{{2}}': 'visit_date (DD/MM/YYYY or DD MMM YYYY)',
            '{{3}}': 'visit_time (HH:MM AM/PM)',
            'button_url_suffix': 'URL-safe journey token (. replaced with ~)'
        }
    }
};

export default META_TEMPLATES;
