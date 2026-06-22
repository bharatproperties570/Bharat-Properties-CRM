import React, { createContext, useContext, useState } from 'react';

const TemplateContext = createContext();

export const useTemplates = () => useContext(TemplateContext);

export const TemplateProvider = ({ children }) => {
    // Seed with standard Enterprise Real Estate Templates
    const [templates, setTemplates] = useState([
        {
            id: 'tpl_wa_greeting',
            name: 'WA - Greeting & Brochure',
            channel: 'WhatsApp',
            content: 'Hi {{Lead_Name}}, thanks for showing interest in our properties. Here is the official brochure for your reference.',
            status: 'Approved'
        },
        {
            id: 'tpl_email_top5',
            name: 'Email - Top 5 Reasons',
            channel: 'Email',
            content: 'Dear {{Lead_Name}},\nHere are the top 5 reasons why investing in this area yields the best ROI...',
            status: 'Approved'
        },
        {
            id: 'tpl_wa_video_tour',
            name: 'WA - Sample Flat Video Tour',
            channel: 'WhatsApp',
            content: 'Hello {{Lead_Name}}, check out this exclusive video tour of our sample flat! Let us know when you want to visit.',
            status: 'Approved'
        },
        {
            id: 'tpl_sms_cab_offer',
            name: 'SMS - Site Visit & Cab',
            channel: 'SMS',
            content: 'Special weekend site visit offer + Free cab pick-up. Call us at {{Agent_Phone}} to book yours!',
            status: 'Approved'
        },
        {
            id: 'tpl_email_urgency',
            name: 'Email - Scarcity / Urgency',
            channel: 'Email',
            content: 'Hi {{Lead_Name}},\nHurry up! Only 5 units are left in this phase at the current price.',
            status: 'Approved'
        },
        {
            id: 'tpl_wa_post_visit',
            name: 'WA - Post Visit Thanks',
            channel: 'WhatsApp',
            content: 'Hi {{Lead_Name}}, thank you for visiting the site today! Let us know if you have any questions.',
            status: 'Approved'
        },
        {
            id: 'tpl_email_comparison',
            name: 'Email - Project Comparison',
            channel: 'Email',
            content: 'Dear {{Lead_Name}},\nWondering how we stack up against the competition? Here is a detailed comparison matrix.',
            status: 'Approved'
        },
        {
            id: 'tpl_email_testimonial',
            name: 'Email - Video Testimonial',
            channel: 'Email',
            content: 'Hi {{Lead_Name}},\nWatch this video to see why the Sharma family chose our project for their dream home.',
            status: 'Approved'
        },
        {
            id: 'tpl_wa_homeloan',
            name: 'WA - Home Loan Assist',
            channel: 'WhatsApp',
            content: 'Hello {{Lead_Name}}, we provide 100% home loan assistance with top banks at special interest rates. Reply "YES" for details.',
            status: 'Approved'
        },
        {
            id: 'tpl_sms_final_offer',
            name: 'SMS - Final Manager Offer',
            channel: 'SMS',
            content: 'Exclusive 5% discount if you book within 48 hours. Valid only for you. Show this message to the Sales Manager.',
            status: 'Approved'
        },
        {
            id: 'tpl_email_market_update',
            name: 'Email - Real Estate Update',
            channel: 'Email',
            content: 'Dear {{Lead_Name}},\nCheck out the latest real estate trends and price appreciation in your preferred city.',
            status: 'Approved'
        },
        {
            id: 'tpl_wa_still_looking',
            name: 'WA - Still Looking?',
            channel: 'WhatsApp',
            content: 'Hi {{Lead_Name}}, are you still looking for a property? We have some new launches that might interest you.',
            status: 'Approved'
        },
        {
            id: 'tpl_email_new_launch',
            name: 'Email - New Project Launch',
            channel: 'Email',
            content: 'Hi {{Lead_Name}},\nGet exclusive pre-launch prices for our upcoming premium project.',
            status: 'Approved'
        },
        // --- DRIP MARKETING TEMPLATES (Nurturing) ---
        {
            id: 'tpl_drip_day3_trust',
            name: 'Drip Day 3 - Top 5 Reasons',
            channel: 'Email',
            content: 'Dear {{Lead_Name}},\nStill thinking about your real estate investment? Here are the top 5 reasons why our project is considered the best choice by experts:\n\n1. Prime Location\n2. High ROI\n3. Premium Amenities\n4. RERA Approved\n5. Trusted Builder\n\nReply to this email to book a free consultation!',
            status: 'Approved'
        },
        {
            id: 'tpl_drip_day7_video',
            name: 'Drip Day 7 - Virtual Tour',
            channel: 'WhatsApp',
            content: 'Hello {{Lead_Name}} 👋,\nTake a VIP Virtual Tour of our Sample Flat right from your phone! 📱\nClick here to watch: [Video Link]\nLet me know what you think! - {{Agent_Name}}',
            status: 'Approved'
        },
        {
            id: 'tpl_drip_day14_urgency',
            name: 'Drip Day 14 - Scarcity Offer',
            channel: 'WhatsApp',
            content: 'Hi {{Lead_Name}}! ⏳ Just 3 corner-units left in Phase 1. If you book a site visit this weekend, we will arrange a complimentary cab pick-up. 🚖 Reply "YES" to claim.',
            status: 'Approved'
        },
        // --- POST-SALES AUTOMATION TEMPLATES ---
        {
            id: 'tpl_post_sales_welcome',
            name: 'Post-Sales - Welcome Home',
            channel: 'WhatsApp',
            content: 'Congratulations {{Lead_Name}}! 🎊 Welcome to the Bharat Properties family. We have successfully registered your booking. Here is a link to your Next Steps and Payment Schedule document: [Doc Link]. Please reach out if you need any assistance!',
            status: 'Approved'
        },
        {
            id: 'tpl_post_sales_update_m1',
            name: 'Post-Sales - Month 1 Construction',
            channel: 'WhatsApp',
            content: 'Hi {{Lead_Name}}, hope you are doing great! 🏗️ Here is the Month 1 construction update for your future home. The foundation work is 80% complete! See live photos here: [Photos Link]',
            status: 'Approved'
        },
        {
            id: 'tpl_post_sales_anniversary',
            name: 'Post-Sales - 1 Year Anniversary',
            channel: 'Email',
            content: 'Dear {{Lead_Name}},\nHappy 1st Anniversary of joining our community! 🎉 It has been a wonderful year building your dream home. We are organizing a special get-together for all future residents next month. Stay tuned for the invite!',
            status: 'Approved'
        },
        // --- AUTOMATED REFERRAL SYSTEM ---
        {
            id: 'tpl_referral_request',
            name: 'Referral - Infinite Marketing Loop',
            channel: 'WhatsApp',
            content: 'Hello {{Lead_Name}}! 🌟 We hope you are excited about your new investment. Did you know you can earn rewards? Refer a friend using your unique link: [Referral Link]. If they book, YOU get a free modular kitchen upgrade! 🎁 Share it today!',
            status: 'Approved'
        },
        {
            id: 'tpl_sms_flash_sale',
            name: 'SMS - Flash Sale / Festival',
            channel: 'SMS',
            content: 'Diwali Special Offer! Get a free Gold Coin on every booking this week. Call now!',
            status: 'Approved'
        },
        {
            id: 'tpl_call_intro',
            name: 'Task - Initial Intro Call',
            channel: 'Call',
            content: 'Call the lead and introduce Bharat Properties.',
            status: 'Approved'
        }
    ]);

    const addTemplate = (template) => {
        setTemplates([...templates, { ...template, id: `tpl_${Date.now()}` }]);
    };

    const updateTemplate = (id, updatedFields) => {
        setTemplates(templates.map(t => t.id === id ? { ...t, ...updatedFields } : t));
    };

    const deleteTemplate = (id) => {
        setTemplates(templates.filter(t => t.id !== id));
    };

    return (
        <TemplateContext.Provider value={{ templates, addTemplate, updateTemplate, deleteTemplate }}>
            {children}
        </TemplateContext.Provider>
    );
};
