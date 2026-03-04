export const emailTemplates = [
    {
        id: 1,
        name: 'Welcome & Discovery',
        author: 'Bharat Properties',
        visibility: 'Owned by everyone',
        tags: ['Welcome', 'Leads'],
        subject: '👋 Welcome to Bharat Properties | Let\'s find your dream home!',
        content: `Dear {{First name}},<br><br>Thank you for choosing <strong>Bharat Properties</strong>. We are thrilled to assist you in your journey to find the perfect property.<br><br>Our mission is to provide you with a seamless and transparent real estate experience. One of our senior consultants will reach out to you shortly to understand your requirements in detail.<br><br>In the meantime, feel free to browse our latest premium listings on our website.<br><br>Best regards,<br><div style="margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 15px;"><strong>{{Sender\'s signature}}</strong><br><span style="color: #64748b; font-size: 0.9rem;">Bharat Properties | Premium Real Estate Solutions</span><br><span style="color: #64748b; font-size: 0.85rem;">Ph: +91-XXXXX-XXXXX | Web: www.bharatproperties.com</span></div>`,
        shared: true
    },
    {
        id: 2,
        name: 'Top Matches Priority',
        author: 'Bharat Properties',
        visibility: 'Owned by everyone',
        tags: ['Leads', 'Priority'],
        subject: '🔥 Exclusive Selection: Top property matches for you!',
        content: `Dear {{First name}},<br><br>Based on our latest market analysis, we have identified these <strong>Top Property Matches</strong> that perfectly align with your requirements.<br><br>{{PropertyList}}<br><br>These properties are currently seeing high interest. Would you like to schedule a priority visit this weekend?<br><br>Best regards,<br><div style="margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 15px;"><strong>{{Sender\'s signature}}</strong><br><span style="color: #64748b; font-size: 0.9rem;">Bharat Properties | Premium Real Estate Solutions</span><br><span style="color: #64748b; font-size: 0.85rem;">Ph: +91-XXXXX-XXXXX | Web: www.bharatproperties.com</span></div>`,
        shared: true
    },
    {
        id: 3,
        name: 'Visit Confirmation',
        author: 'Bharat Properties',
        visibility: 'Owned by everyone',
        tags: ['Site Visit'],
        subject: '✅ Confirmed: Your Property Visit for {{PropertyList}}',
        content: `Hello {{First name}},<br><br>Your site visit has been successfully scheduled. Here are the details:<br><br>📍 <strong>Location:</strong> {{PropertyList}}<br>📅 <strong>Date & Time:</strong> [Insert Selection]<br>👤 <strong>Assigned Executive:</strong> {{Sender\'s first name}}<br><br>We recommend arriving 5 minutes early. If you need a pickup or directions, please reply to this email or call us directly.<br><br>Looking forward to showing you your potential future home!<br><br>Best regards,<br><div style="margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 15px;"><strong>{{Sender\'s signature}}</strong><br><span style="color: #64748b; font-size: 0.9rem;">Bharat Properties | Premium Real Estate Solutions</span><br><span style="color: #64748b; font-size: 0.85rem;">Ph: +91-XXXXX-XXXXX | Web: www.bharatproperties.com</span></div>`,
        shared: true
    },
    {
        id: 4,
        name: 'Post-Visit Feedback',
        author: 'Bharat Properties',
        visibility: 'Owned by everyone',
        tags: ['Follow-up'],
        subject: '🏠 Thoughts on your recent visit? | Next steps for {{PropertyList}}',
        content: `Dear {{First name}},<br><br>It was a pleasure meeting you during our visit to <strong>{{PropertyList}}</strong> today. We would love to hear your thoughts on the property.<br><br>Did the unit meet your expectations, or would you like to explore other options in a similar range?<br><br><strong>Next Steps:</strong> We can initiate the negotiation process if you liked this unit, or I can share 2-3 alternative listings by tomorrow morning.<br><br>Waiting for your feedback.<br><br>Best regards,<br><div style="margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 15px;"><strong>{{Sender\'s signature}}</strong><br><span style="color: #64748b; font-size: 0.9rem;">Bharat Properties | Premium Real Estate Solutions</span><br><span style="color: #64748b; font-size: 0.85rem;">Ph: +91-XXXXX-XXXXX | Web: www.bharatproperties.com</span></div>`,
        shared: true
    },
    {
        id: 5,
        name: 'Market Update / Re-engagement',
        author: 'Bharat Properties',
        visibility: 'Owned by everyone',
        tags: ['Re-engagement'],
        subject: '💎 New inventory just landed! | Are you still looking in {{Address}}?',
        content: `Hi {{First name}},<br><br>It\'s been a while since we last spoke! I wanted to give you a quick heads-up that some <strong>exclusive new inventory</strong> has just opened up in {{Address}} that matches your previous preferences.<br><br>Before these hit the public portals, would you like to see the details?<br><br>Looking forward to reconnecting.<br><br>Best regards,<br><div style="margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 15px;"><strong>{{Sender\'s signature}}</strong><br><span style="color: #64748b; font-size: 0.9rem;">Bharat Properties | Premium Real Estate Solutions</span><br><span style="color: #64748b; font-size: 0.85rem;">Ph: +91-XXXXX-XXXXX | Web: www.bharatproperties.com</span></div>`,
        shared: true
    },
    {
        id: 6,
        name: 'Booking Success',
        author: 'Bharat Properties',
        visibility: 'Owned by everyone',
        tags: ['Deals', 'Success'],
        subject: '🎉 Congratulations on your new home at {{Company name}}!',
        content: `Dear {{First name}},<br><br><div style="text-align: center; padding: 20px; background: #f0fdf4; border-radius: 12px; border: 1px solid #bbf7d0;"><h2>🎉 CONGRATULATIONS!</h2><p>Your booking for the unit at <strong>{{Company name}}</strong> has been successfully processed.</p></div><br>This is a major milestone, and we are honored to be part of it. Our post-sales team will guide you through the documentation and registry process shortly.<br><br>Welcome to the Bharat Properties family!<br><br>Best regards,<br><div style="margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 15px;"><strong>{{Sender\'s signature}}</strong><br><span style="color: #64748b; font-size: 0.9rem;">Bharat Properties | Premium Real Estate Solutions</span><br><span style="color: #64748b; font-size: 0.85rem;">Ph: +91-XXXXX-XXXXX | Web: www.bharatproperties.com</span></div>`,
        shared: true
    },
    {
        id: 7,
        name: 'Document Request',
        author: 'Bharat Properties',
        visibility: 'Owned by everyone',
        tags: ['Operations'],
        subject: '📄 Action Required: Documentation for {{First name}}',
        content: `Dear {{First name}},<br><br>To proceed with your application for {{Company name}}, we require the following documents at your earliest convenience:<br><br>✅ PAN Card Copy<br>✅ Aadhaar Card (Front & Back)<br>✅ Passport Size Photograph<br>✅ Booking Cheque/Transaction Receipt<br><br>Please reply to this email with the scanned copies or WhatsApp them to us at +91-XXXXX-XXXXX.<br><br>Keeping these ready will ensure a smooth and priority processing of your file.<br><br>Best regards,<br><div style="margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 15px;"><strong>{{Sender\'s signature}}</strong><br><span style="color: #64748b; font-size: 0.9rem;">Bharat Properties | Premium Real Estate Solutions</span><br><span style="color: #64748b; font-size: 0.85rem;">Ph: +91-XXXXX-XXXXX | Web: www.bharatproperties.com</span></div>`,
        shared: true
    },
    {
        id: 8,
        name: 'Property Presentation',
        author: 'Bharat Properties',
        visibility: 'Owned by everyone',
        tags: ['Presentation', 'Property'],
        subject: '🏠 Property Details: {{PropertyName}} at {{Address}}',
        content: `Dear {{First name}},<br><br>As discussed, I am sharing the details of a premium property that perfectly matches your requirement:<br><br><div style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; background: #f8fafc;"><h3>🏠 {{PropertyName}}</h3>📍 <strong>Location:</strong> {{Address}}<br>📏 <strong>Size:</strong> {{Size}}<br>💰 <strong>Exclusive Price:</strong> {{Price}}<br><br>{{PropertyDescription}}</div><br>I have also attached the site plan and additional images for your reference. Would you like to schedule a site visit for this property?<br><br>Best regards,<br><div style="margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 15px;"><strong>{{Sender\'s signature}}</strong><br><span style="color: #64748b; font-size: 0.9rem;">Bharat Properties | Premium Real Estate Solutions</span><br><span style="color: #64748b; font-size: 0.85rem;">Ph: +91-XXXXX-XXXXX | Web: www.bharatproperties.com</span></div>`,
        shared: true
    }
];

export const whatsappTemplates = [
    {
        id: 1,
        name: 'Property Presentation',
        content: `Hi {{ContactName}}! 🏠

I found a *{{PropertyType}}* that matches your requirement perfectly!

📍 *Location:* {{Location}}
📏 *Size:* {{Size}}
💰 *Price:* ₹{{Price}}
✨ *Highlights:* {{Highlights}}

🔗 View Details: {{PropertyLink}}

This property is getting high interest. Would you like to schedule a visit this weekend?

Best regards,
*{{AgentName}}*
Bharat Properties
📞 {{AgentPhone}}`,
        tags: ['Property', 'Lead Nurturing']
    },
    {
        id: 2,
        name: 'Property Portfolio',
        content: `Hi {{ContactName}},

As discussed, I've curated a portfolio of *{{PropertiesCount}} premium properties* specifically matching your requirements. 🏠💼

{{PropertyList}}

I'd love to discuss these further and schedule visits for your top choices.

*Which one stands out to you the most?*

Looking forward to your feedback!

Best regards,
*{{AgentName}}*
Bharat Properties
📞 {{AgentPhone}}`,
        tags: ['Property', 'Portfolio']
    },
    {
        id: 3,
        name: 'Exclusive Deal Alert',
        content: `🔥 *EXCLUSIVE OPPORTUNITY* 🔥

Hi {{ContactName}},

A *{{PropertyType}}* just became available in *{{Location}}* that perfectly matches your requirements!

💎 *Key Details:*
📏 Size: {{Size}}
💰 Price: ₹{{Price}}
🎯 Match Score: {{MatchPercentage}}%

⚡ *Why this is perfect for you:*
{{MatchReasons}}

This won't last long - {{CompetingBuyers}} other buyers are already interested!

*Can we schedule a viewing today or tomorrow?*

Best regards,
*{{AgentName}}*
Bharat Properties
📞 {{AgentPhone}}`,
        tags: ['Deal', 'Urgent']
    },
    {
        id: 4,
        name: 'Site Visit Invitation',
        content: `Hi {{ContactName}}! 👋

Great news! The *{{PropertyType}}* in *{{Location}}* is available for viewing.

📅 *Suggested Visit Slots:*
• {{Slot1}}
• {{Slot2}}
• {{Slot3}}

I'll personally accompany you and share insider details about the property and neighborhood.

*Which slot works best for you?*

Just reply with the number (1, 2, or 3) and I'll confirm immediately!

See you soon,
*{{AgentName}}*
Bharat Properties
📞 {{AgentPhone}}`,
        tags: ['Site Visit', 'Action']
    },
    {
        id: 5,
        name: 'Quick Inquiry Response',
        content: `Hi {{ContactName}}! 😊

Thank you for your inquiry about *{{PropertyType}}* in *{{Location}}*!

I've received your requirements:
{{RequirementSummary}}

✅ *Good news!* We have {{MatchCount}} properties that match your criteria.

I'm preparing a curated list for you. Meanwhile, could you confirm:
1. Your preferred budget range?
2. Timeline for purchase?
3. Any specific must-haves?

I'll get back to you within 30 minutes with the best options!

Best regards,
*{{AgentName}}*
Bharat Properties
📞 {{AgentPhone}}`,
        tags: ['Inquiry', 'Response']
    },
    {
        id: 6,
        name: 'Follow-up After Site Visit',
        content: `Hi {{ContactName}},

Thank you for visiting *{{PropertyName}}* with me today! 🏠

I hope you liked what you saw. Here's a quick summary:

✅ *What you loved:* {{PositiveFeedback}}
🤔 *Your concerns:* {{Concerns}}

*Next Steps:*
{{NextSteps}}

Feel free to call me anytime if you have questions.

Best regards,
*{{AgentName}}*
Bharat Properties
📞 {{AgentPhone}}`,
        tags: ['Follow-up', 'Site Visit']
    },
    {
        id: 7,
        name: 'Welcome Message',
        content: `Welcome to Bharat Properties, {{ContactName}}! 🎉

I'm *{{AgentName}}*, your dedicated property consultant.

🏆 *What I'll help you with:*
✓ Find properties matching your exact needs
✓ Arrange site visits at your convenience
✓ Negotiate the best prices
✓ Handle all documentation

📱 *How to reach me:*
• WhatsApp: {{AgentPhone}} (Fastest!)
• Call: {{AgentPhone}}
• Email: {{AgentEmail}}

*What type of property are you looking for?*

Let's find your dream property together!

Best regards,
*{{AgentName}}*
Bharat Properties`,
        tags: ['Welcome', 'Onboarding']
    },
    {
        id: 8,
        name: 'Price Drop Alert',
        content: `🔔 *PRICE DROP ALERT!* 🔔

Hi {{ContactName}},

Remember the *{{PropertyType}}* in *{{Location}}* you were interested in?

*Great news!* The price has been reduced:

~~₹{{OldPrice}}~~ → *₹{{NewPrice}}*

💰 *You save: ₹{{Savings}}!*

This is a limited-time opportunity. The owner needs to close quickly.

*Interested? Let's schedule a visit ASAP!*

Best regards,
*{{AgentName}}*
Bharat Properties
📞 {{AgentPhone}}`,
        tags: ['Price Drop', 'Urgent']
    },
    {
        id: 9,
        name: 'Document Request',
        content: `Hi {{ContactName}},

To proceed with your *{{PropertyType}}* booking in *{{Location}}*, we need the following documents:

📄 *Required Documents:*
{{DocumentList}}

*How to submit:*
Simply click photos and send them via WhatsApp to this number.

⏰ *Timeline:* Please share by {{Deadline}} to secure the property.

Let me know if you need any clarification!

Best regards,
*{{AgentName}}*
Bharat Properties
📞 {{AgentPhone}}`,
        tags: ['Documentation', 'Transaction']
    },
    {
        id: 10,
        name: 'Payment Reminder',
        content: `Hi {{ContactName}},

This is a friendly reminder about your upcoming payment for *{{PropertyName}}*.

💰 *Payment Details:*
Amount: ₹{{Amount}}
Due Date: {{DueDate}}
Payment Type: {{PaymentType}}

*Payment Options:*
{{PaymentMethods}}

Please confirm once done. Let me know if you need any assistance!

Best regards,
*{{AgentName}}*
Bharat Properties
📞 {{AgentPhone}}`,
        tags: ['Payment', 'Reminder']
    }
];

export const smsTemplates = [
    {
        id: 1,
        name: 'Property Alert',
        body: 'Hi {{1}}, New {{2}} available in {{3}}! Size: {{4}}, Price: Rs{{5}}. Visit: {{6}}. Call {{7}} - Bharat Properties',
        tags: ['Property', 'Alert']
    },
    {
        id: 2,
        name: 'Site Visit Confirmation',
        body: 'Hi {{1}}, Your site visit for {{2}} at {{3}} is confirmed for {{4}}. Agent {{5}} will meet you. Call {{6}} for changes. - Bharat Properties',
        tags: ['Site Visit', 'Confirmation']
    },
    {
        id: 3,
        name: 'Quick Follow-up',
        body: 'Hi {{1}}, Following up on {{2}} in {{3}}. Still interested? We have {{4}} similar options. Reply YES or call {{5}} - {{6}}, Bharat Properties',
        tags: ['Follow-up']
    },
    {
        id: 4,
        name: 'Document Reminder',
        body: 'Hi {{1}}, Reminder: Please submit {{2}} for {{3}} booking by {{4}}. WhatsApp docs to {{5}} or email {{6}}. - Bharat Properties',
        tags: ['Documentation', 'Reminder']
    },
    {
        id: 5,
        name: 'Payment Due',
        body: 'Hi {{1}}, Payment reminder for {{2}}: Rs{{3}} due on {{4}}. Pay via {{5}}. Confirm at {{6}}. Thank you! - Bharat Properties',
        tags: ['Payment', 'Reminder']
    },
    {
        id: 6,
        name: 'Price Drop Alert',
        body: 'PRICE DROP! {{1}} in {{2}} now Rs{{3}} (was Rs{{4}}). Save Rs{{5}}! Limited time. Call {{6}} NOW - {{7}}, Bharat Properties',
        tags: ['Price Drop', 'Urgent']
    },
    {
        id: 7,
        name: 'Welcome SMS',
        body: 'Welcome {{1}}! I am {{2}}, your property consultant at Bharat Properties. Looking for {{3}}? Call/WhatsApp {{4}} anytime. Lets find your dream home!',
        tags: ['Welcome', 'Onboarding']
    },
    {
        id: 8,
        name: 'Deal Closure',
        body: 'Congratulations {{1}}! Your {{2}} booking in {{3}} is confirmed. Booking ID: {{4}}. Next steps: {{5}}. Contact {{6}} - Bharat Properties',
        tags: ['Closure', 'Confirmation']
    },
    {
        id: 9,
        name: 'Exclusive Offer',
        body: 'EXCLUSIVE for you {{1}}! {{2}} in {{3}} - {{4}} match! Rs{{5}}, {{6}}. Book visit: {{7}}. Offer ends {{8}} - Bharat Properties',
        tags: ['Offer', 'Exclusive']
    },
    {
        id: 10,
        name: 'Birthday Wishes',
        body: 'Happy Birthday {{1}}! Wishing you joy & success. May this year bring you closer to your dream home. Best wishes - {{2}}, Bharat Properties',
        tags: ['Birthday', 'Relationship']
    }
];

export const rcsTemplates = [
    {
        id: 1,
        name: 'Premium Property Showcase',
        body: 'Discover Your Dream Home 🏠\n\n{{1}} in {{2}}\n\nSize: {{3}}\nPrice: ₹{{4}}\nHighlights: {{5}}\n\nExclusive viewing slots available!',
        media: { type: 'image', url: 'property_image_url' },
        buttons: [
            { type: 'URL', text: 'View Details', url: '{{6}}' },
            { type: 'PHONE', text: 'Call Agent', phone: '{{7}}' },
            { type: 'REPLY', text: 'Book Visit', reply: 'BOOK_VISIT' }
        ],
        tags: ['Property', 'Premium']
    },
    {
        id: 2,
        name: 'New Project Launch',
        body: '🚀 NEW LAUNCH: {{1}}\n\n{{2}}\n\n✨ Features:\n{{3}}\n\n💎 Early Bird Offer:\n{{4}}\n\nLimited units available!',
        media: { type: 'image', url: 'project_banner_url' },
        buttons: [
            { type: 'URL', text: 'View Brochure', url: '{{5}}' },
            { type: 'PHONE', text: 'Call Now', phone: '{{6}}' },
            { type: 'REPLY', text: 'Get Price List', reply: 'PRICE_LIST' }
        ],
        tags: ['Launch', 'Marketing']
    },
    {
        id: 3,
        name: 'Site Visit Invitation',
        body: 'Your Property Viewing Awaits! 🗓️\n\n{{1}} in {{2}}\n\nAvailable Slots:\n• {{3}}\n• {{4}}\n• {{5}}\n\nAgent {{6}} will accompany you.',
        media: { type: 'image', url: 'property_exterior_url' },
        buttons: [
            { type: 'REPLY', text: 'Slot 1', reply: 'SLOT_1' },
            { type: 'REPLY', text: 'Slot 2', reply: 'SLOT_2' },
            { type: 'REPLY', text: 'Slot 3', reply: 'SLOT_3' },
            { type: 'PHONE', text: 'Call Agent', phone: '{{7}}' }
        ],
        tags: ['Site Visit', 'Interactive']
    },
    {
        id: 4,
        name: 'Virtual Tour Invitation',
        body: 'Experience {{1}} from Home! 🎥\n\n360° Virtual Tour Available\n\nLocation: {{2}}\nSize: {{3}}\nPrice: ₹{{4}}\n\nTake a virtual walk-through now!',
        media: { type: 'video', url: 'virtual_tour_url' },
        buttons: [
            { type: 'URL', text: 'Start Virtual Tour', url: '{{5}}' },
            { type: 'REPLY', text: 'Book Physical Visit', reply: 'PHYSICAL_VISIT' },
            { type: 'PHONE', text: 'Speak to Agent', phone: '{{6}}' }
        ],
        tags: ['Virtual Tour', 'Technology']
    },
    {
        id: 5,
        name: 'Document Submission',
        body: 'Document Checklist 📄\n\nFor {{1}} booking:\n\n{{2}}\n\nDeadline: {{3}}\n\nSubmit via WhatsApp or upload online.',
        media: { type: 'image', url: 'document_checklist_url' },
        buttons: [
            { type: 'URL', text: 'Upload Documents', url: '{{4}}' },
            { type: 'PHONE', text: 'WhatsApp Docs', phone: '{{5}}' },
            { type: 'REPLY', text: 'Need Help', reply: 'HELP_DOCS' }
        ],
        tags: ['Documentation', 'Transaction']
    },
    {
        id: 6,
        name: 'Payment Reminder Rich',
        body: 'Payment Reminder 💰\n\n{{1}}\n\nAmount: ₹{{2}}\nDue: {{3}}\nType: {{4}}\n\nPay securely online or via bank transfer.',
        media: { type: 'image', url: 'payment_reminder_banner' },
        buttons: [
            { type: 'URL', text: 'Pay Online', url: '{{5}}' },
            { type: 'REPLY', text: 'Payment Done', reply: 'PAID' },
            { type: 'PHONE', text: 'Call Support', phone: '{{6}}' }
        ],
        tags: ['Payment', 'Reminder']
    },
    {
        id: 7,
        name: 'Exclusive Deal Alert',
        body: '🔥 EXCLUSIVE MATCH!\n\n{{1}}, we found your perfect property!\n\n{{2}} in {{3}}\nMatch Score: {{4}}%\n\nPrice: ₹{{5}}\n\n⚡ High demand - Act fast!',
        media: { type: 'image', url: 'property_highlight_url' },
        buttons: [
            { type: 'URL', text: 'Full Details', url: '{{6}}' },
            { type: 'REPLY', text: 'Book Visit Today', reply: 'BOOK_NOW' },
            { type: 'REPLY', text: 'See Similar', reply: 'SIMILAR' },
            { type: 'PHONE', text: 'Call {{7}}', phone: '{{7}}' }
        ],
        tags: ['Deal', 'Urgent', 'Personalized']
    },
    {
        id: 8,
        name: 'Customer Testimonial',
        body: '⭐ Success Story\n\n"{{1}}"\n\n- {{2}}\n{{3}}\n\nJoin {{4}}+ happy homeowners!\n\nLet us help you find your dream property.',
        media: { type: 'image', url: 'testimonial_image_url' },
        buttons: [
            { type: 'URL', text: 'View All Reviews', url: '{{5}}' },
            { type: 'REPLY', text: 'Start My Journey', reply: 'START' },
            { type: 'PHONE', text: 'Talk to Expert', phone: '{{6}}' }
        ],
        tags: ['Testimonial', 'Trust Building']
    },
    {
        id: 9,
        name: 'Price Comparison',
        body: 'Smart Investment Alert 📊\n\n{{1}} in {{2}}\n\nOur Price: ₹{{3}}\nMarket Avg: ₹{{4}}\nYou Save: ₹{{5}}\n\nROI Potential: {{6}}%',
        media: { type: 'image', url: 'price_comparison_chart' },
        buttons: [
            { type: 'URL', text: 'Detailed Analysis', url: '{{7}}' },
            { type: 'REPLY', text: 'Book Now', reply: 'BOOK' },
            { type: 'PHONE', text: 'Discuss Investment', phone: '{{8}}' }
        ],
        tags: ['Investment', 'Analytics']
    },
    {
        id: 10,
        name: 'Feedback Request',
        body: 'We Value Your Feedback! 🌟\n\nHi {{1}},\n\nHow was your experience with Bharat Properties?\n\nYour feedback helps us serve you better.',
        media: { type: 'image', url: 'feedback_banner_url' },
        buttons: [
            { type: 'URL', text: 'Share Feedback', url: '{{2}}' },
            { type: 'REPLY', text: 'Excellent ⭐⭐⭐⭐⭐', reply: 'RATING_5' },
            { type: 'REPLY', text: 'Good ⭐⭐⭐⭐', reply: 'RATING_4' },
            { type: 'PHONE', text: 'Call Us', phone: '{{3}}' }
        ],
        tags: ['Feedback', 'Relationship']
    }
];
