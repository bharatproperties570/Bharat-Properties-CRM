export const emailTemplates = [
    {
        id: 1,
        name: 'Welcome & Discovery',
        author: 'Bharat Properties',
        visibility: 'Owned by everyone',
        tags: ['Welcome', 'Leads'],
        subject: '👋 Welcome to Bharat Properties | Let\'s find your dream home!',
        content: `Dear {{First name}},<br><br>Thank you for choosing <strong>Bharat Properties</strong>. We are thrilled to assist you in your journey to find the perfect property.<br><br>Our mission is to provide you with a seamless and transparent real estate experience. One of our senior consultants will reach out to you shortly to understand your requirements in detail.<br><br>In the meantime, feel free to browse our latest premium listings on our website.<br><br>Best regards,<br>{{Sender's signature}}`,
        shared: true
    },
    {
        id: 2,
        name: 'Top Matches Priority',
        author: 'Bharat Properties',
        visibility: 'Owned by everyone',
        tags: ['Leads', 'Priority'],
        subject: '🔥 Exclusive Selection: Top property matches for you!',
        content: `Dear {{First name}},<br><br>Based on our latest market analysis, we have identified these <strong>Top Property Matches</strong> that perfectly align with your requirements.<br><br>{{PropertyList}}<br><br>These properties are currently seeing high interest. Would you like to schedule a priority visit this weekend?<br><br>Best regards,<br>{{Sender's signature}}`,
        shared: true
    },
    {
        id: 3,
        name: 'Visit Confirmation',
        author: 'Bharat Properties',
        visibility: 'Owned by everyone',
        tags: ['Site Visit'],
        subject: '✅ Confirmed: Your Property Visit for {{PropertyList}}',
        content: `Hello {{First name}},<br><br>Your site visit has been successfully scheduled. Here are the details:<br><br>📍 <strong>Location:</strong> {{PropertyList}}<br>📅 <strong>Date & Time:</strong> [Insert Selection]<br>👤 <strong>Assigned Executive:</strong> {{Sender's first name}}<br><br>We recommend arriving 5 minutes early. If you need a pickup or directions, please reply to this email or call us directly.<br><br>Looking forward to showing you your potential future home!<br><br>Best regards,<br>{{Sender's signature}}`,
        shared: true
    },
    {
        id: 4,
        name: 'Post-Visit Feedback',
        author: 'Bharat Properties',
        visibility: 'Owned by everyone',
        tags: ['Follow-up'],
        subject: '🏠 Thoughts on your recent visit? | Next steps for {{PropertyList}}',
        content: `Dear {{First name}},<br><br>It was a pleasure meeting you during our visit to <strong>{{PropertyList}}</strong> today. We would love to hear your thoughts on the property.<br><br>Did the unit meet your expectations, or would you like to explore other options in a similar range?<br><br><strong>Next Steps:</strong> We can initiate the negotiation process if you liked this unit, or I can share 2-3 alternative listings by tomorrow morning.<br><br>Waiting for your feedback.<br><br>Best regards,<br>{{Sender's signature}}`,
        shared: true
    },
    {
        id: 5,
        name: 'Market Update / Re-engagement',
        author: 'Bharat Properties',
        visibility: 'Owned by everyone',
        tags: ['Re-engagement'],
        subject: '💎 New inventory just landed! | Are you still looking in {{Address}}?',
        content: `Hi {{First name}},<br><br>It's been a while since we last spoke! I wanted to give you a quick heads-up that some <strong>exclusive new inventory</strong> has just opened up in {{Address}} that matches your previous preferences.<br><br>Before these hit the public portals, would you like to see the details?<br><br>Looking forward to reconnecting.<br><br>Best regards,<br>{{Sender's signature}}`,
        shared: true
    },
    {
        id: 6,
        name: 'Booking Success',
        author: 'Bharat Properties',
        visibility: 'Owned by everyone',
        tags: ['Deals', 'Success'],
        subject: '🎉 Congratulations on your new home at {{Company name}}!',
        content: `Dear {{First name}},<br><br><div style="text-align: center; padding: 20px; background: #f0fdf4; border-radius: 12px; border: 1px solid #bbf7d0;"><h2>🎉 CONGRATULATIONS!</h2><p>Your booking for the unit at <strong>{{Company name}}</strong> has been successfully processed.</p></div><br>This is a major milestone, and we are honored to be part of it. Our post-sales team will guide you through the documentation and registry process shortly.<br><br>Welcome to the Bharat Properties family!<br><br>Best regards,<br>{{Sender's signature}}`,
        shared: true
    },
    {
        id: 7,
        name: 'Document Request',
        author: 'Bharat Properties',
        visibility: 'Owned by everyone',
        tags: ['Operations'],
        subject: '📄 Action Required: Documentation for {{First name}}',
        content: `Dear {{First name}},<br><br>To proceed with your application for {{Company name}}, we require the following documents at your earliest convenience:<br><br>✅ PAN Card Copy<br>✅ Aadhaar Card (Front & Back)<br>✅ Passport Size Photograph<br>✅ Booking Cheque/Transaction Receipt<br><br>Please reply to this email with the scanned copies or WhatsApp them to us at +91-XXXXX-XXXXX.<br><br>Keeping these ready will ensure a smooth and priority processing of your file.<br><br>Best regards,<br>{{Sender's signature}}`,
        shared: true
    },
    {
        id: 8,
        name: 'Deal Property Match',
        author: 'Bharat Properties',
        visibility: 'Owned by everyone',
        tags: ['Deal Match', 'Priority', 'Leads'],
        subject: '🏠 Exclusive Property Match Found for You | {{DealProject}}',
        isDealMatchTemplate: true,
        content: `<div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 640px; margin: 0 auto; background: #f8fafc;">

  <!-- Header Banner -->
  <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 60%, #0ea5e9 100%); padding: 36px 40px 32px; border-radius: 16px 16px 0 0; text-align: center;">
    <div style="display: inline-block; background: rgba(255,255,255,0.15); border-radius: 50px; padding: 6px 20px; margin-bottom: 16px;">
      <span style="color: #bfdbfe; font-size: 12px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase;">⭐ Exclusive Property Match</span>
    </div>
    <h1 style="margin: 0 0 8px; color: #ffffff; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">We Found Your Perfect Match!</h1>
    <p style="margin: 0; color: #bfdbfe; font-size: 15px; font-weight: 500;">Based on your requirements, here is a curated property that fits you perfectly.</p>
  </div>

  <!-- Greeting -->
  <div style="background: #ffffff; padding: 32px 40px 0;">
    <p style="margin: 0 0 6px; font-size: 15px; color: #475569;">Dear <strong style="color: #1e293b;">{{First name}}</strong>,</p>
    <p style="margin: 0; font-size: 14px; color: #64748b; line-height: 1.7;">I am pleased to share an exclusive property opportunity that perfectly aligns with your investment goals and lifestyle requirements. This unit is currently available and seeing strong buyer interest — I recommend reviewing it at the earliest convenience.</p>
  </div>

  <!-- Property Card -->
  <div style="background: #ffffff; padding: 24px 40px 32px;">

    <!-- Project Name Banner -->
    <div style="background: linear-gradient(135deg, #f0f9ff, #e0f2fe); border: 1px solid #bae6fd; border-radius: 12px; padding: 20px 24px; margin-bottom: 20px;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px;">
        <div>
          <div style="font-size: 11px; font-weight: 700; color: #0284c7; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;">📍 Project</div>
          <div style="font-size: 22px; font-weight: 900; color: #0c4a6e; margin: 0;">{{DealProject}}</div>
          <div style="font-size: 13px; color: #0369a1; margin-top: 4px; font-weight: 600;">{{DealLocation}}</div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 11px; font-weight: 700; color: #059669; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;">💰 Asking Price</div>
          <div style="font-size: 24px; font-weight: 900; color: #065f46;">{{DealPrice}}</div>
          <div style="font-size: 11px; color: #6b7280; margin-top: 3px; font-weight: 600;">All Inclusive</div>
        </div>
      </div>
    </div>

    <!-- Property Details Grid -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px;">

      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px;">
        <div style="font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px;">🏗 Unit Number</div>
        <div style="font-size: 16px; font-weight: 800; color: #1e293b;">{{DealUnit}}</div>
      </div>

      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px;">
        <div style="font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px;">📐 Size / Area</div>
        <div style="font-size: 16px; font-weight: 800; color: #1e293b;">{{DealSize}}</div>
      </div>

      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px;">
        <div style="font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px;">🏠 Category</div>
        <div style="font-size: 15px; font-weight: 800; color: #1e293b;">{{DealCategory}}</div>
      </div>

      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px;">
        <div style="font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px;">🏷 Type / Specification</div>
        <div style="font-size: 15px; font-weight: 800; color: #1e293b;">{{DealSubCategory}}</div>
      </div>

      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px;">
        <div style="font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px;">🏢 Block / Floor</div>
        <div style="font-size: 15px; font-weight: 800; color: #1e293b;">{{DealBlock}}</div>
      </div>

      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px;">
        <div style="font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px;">🧭 Orientation</div>
        <div style="font-size: 15px; font-weight: 800; color: #1e293b;">{{DealOrientation}}</div>
      </div>

      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px;">
        <div style="font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px;">📐 Size Type</div>
        <div style="font-size: 15px; font-weight: 800; color: #1e293b;">{{DealSizeLabel}}</div>
      </div>

      {{DealBuiltupHTML}}

      <div style="background: #fefce8; border: 1px solid #fde68a; border-radius: 10px; padding: 14px 16px;">
        <div style="font-size: 10px; font-weight: 700; color: #92400e; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px;">📊 Availability Status</div>
        <div style="font-size: 15px; font-weight: 800; color: #78350f;">{{DealStage}}</div>
      </div>

    </div>

    <!-- Why This Property -->
    <div style="background: linear-gradient(135deg, #faf5ff, #ede9fe); border: 1px solid #ddd6fe; border-radius: 12px; padding: 20px 24px; margin-bottom: 20px;">
      <div style="font-size: 13px; font-weight: 800; color: #5b21b6; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
        <span>✨</span> Why This Property Matches You
      </div>
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="width: 6px; height: 6px; border-radius: 50%; background: #7c3aed; flex-shrink: 0;"></div>
          <span style="font-size: 13px; color: #374151; font-weight: 600;">Location matches your preferred area in <strong>{{DealLocation}}</strong></span>
        </div>
        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="width: 6px; height: 6px; border-radius: 50%; background: #7c3aed; flex-shrink: 0;"></div>
          <span style="font-size: 13px; color: #374151; font-weight: 600;">Asking price of <strong>{{DealPrice}}</strong> is aligned with your budget range</span>
        </div>
        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="width: 6px; height: 6px; border-radius: 50%; background: #7c3aed; flex-shrink: 0;"></div>
          <span style="font-size: 13px; color: #374151; font-weight: 600;">Property type and size configuration suit your stated requirements</span>
        </div>
        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="width: 6px; height: 6px; border-radius: 50%; background: #7c3aed; flex-shrink: 0;"></div>
          <span style="font-size: 13px; color: #374151; font-weight: 600;">Currently <strong>{{DealStage}}</strong> — act quickly to secure this unit</span>
        </div>
      </div>
    </div>

    <!-- Urgency Banner -->
    <div style="background: linear-gradient(135deg, #fff7ed, #ffedd5); border: 1px solid #fed7aa; border-radius: 12px; padding: 16px 20px; margin-bottom: 24px; display: flex; align-items: center; gap: 12px;">
      <span style="font-size: 20px;">⏰</span>
      <div>
        <div style="font-size: 13px; font-weight: 800; color: #9a3412; margin-bottom: 2px;">Limited Availability — Priority Booking Open</div>
        <div style="font-size: 12px; color: #c2410c; font-weight: 500;">This unit is being shared with a select group of serious buyers. Please confirm your interest to hold priority.</div>
      </div>
    </div>

    <!-- CTA Buttons -->
    <div style="text-align: center; margin-bottom: 24px;">
      <a href="tel:+919991333570" style="display: inline-block; background: linear-gradient(135deg, #2563eb, #1d4ed8); color: #ffffff; padding: 14px 32px; border-radius: 50px; text-decoration: none; font-size: 14px; font-weight: 800; letter-spacing: 0.3px; box-shadow: 0 4px 15px rgba(37,99,235,0.35); margin-right: 10px; margin-bottom: 10px;">
        📞 Call to Schedule Visit
      </a>
      <a href="https://wa.me/919991333570" style="display: inline-block; background: linear-gradient(135deg, #25d366, #128c7e); color: #ffffff; padding: 14px 32px; border-radius: 50px; text-decoration: none; font-size: 14px; font-weight: 800; letter-spacing: 0.3px; box-shadow: 0 4px 15px rgba(37,211,102,0.35); margin-bottom: 10px;">
        💬 WhatsApp Us
      </a>
    </div>

    <!-- Divider -->
    <div style="border-top: 1px solid #e2e8f0; margin: 8px 0 24px;"></div>

    <!-- Closing -->
    <p style="font-size: 14px; color: #475569; line-height: 1.7; margin: 0 0 16px;">I am available for a detailed walkthrough at your preferred time. Please feel free to reach out, and I will ensure a seamless experience from property viewing to documentation.</p>
    <p style="font-size: 14px; color: #475569; margin: 0 0 6px;">Warm regards,</p>
    <strong style="font-size: 15px; color: #1e293b;">{{Sender's signature}}</strong>
    <p style="font-size: 12px; color: #94a3b8; margin: 4px 0 0;">Bharat Properties | 📞 +91-9991333570</p>
  </div>

  <!-- Footer -->
  <div style="background: #1e293b; padding: 20px 40px; border-radius: 0 0 16px 16px; text-align: center;">
    <p style="margin: 0 0 6px; font-size: 12px; color: #64748b;">This is a curated match sent exclusively to you. To unsubscribe, reply with "STOP".</p>
    <p style="margin: 0; font-size: 11px; color: #475569;">© 2025 Bharat Properties. All rights reserved.</p>
  </div>

</div>`,
        shared: true
    },
    {
        id: 'fb_interested_hot',
        name: 'Feedback: Interested (Hot)',
        author: 'System',
        tags: ['Feedback', 'Inventory'],
        subject: 'Priority Update regarding {unit}',
        content: `Hi {owner},<br><br>Great to hear from you regarding <strong>{unit}</strong>! I'm finalizing the details for our <strong>{time}</strong> meeting. Please keep the original documents ready.<br><br>Best regards,<br>Bharat Properties`,
        shared: true
    },
    {
        id: 'fb_interested_warm',
        name: 'Feedback: Interested (Warm)',
        author: 'System',
        tags: ['Feedback', 'Inventory'],
        subject: 'Interest noted for {unit}',
        content: `Hi {owner},<br><br>Thank you for your time discussing <strong>{unit}</strong>. I've noted your interest for <strong>{reason}</strong>. I will share some market comparisons shortly.<br><br>Best regards,<br>Bharat Properties`,
        shared: true
    },
    {
        id: 'fb_callback',
        name: 'Feedback: Request Call Back',
        author: 'System',
        tags: ['Feedback', 'Inventory'],
        subject: 'Call back request for {unit}',
        content: `Hi {owner},<br><br>Apologies for the interruption. I will call you back at <strong>{time}</strong> regarding <strong>{unit}</strong> as requested.<br><br>Best regards,<br>Bharat Properties`,
        shared: true
    },
    {
        id: 'fb_not_interested',
        name: 'Feedback: Not Interested',
        author: 'System',
        tags: ['Feedback', 'Inventory'],
        subject: 'Status update for {unit}',
        content: `Hi {owner},<br><br>Thank you for the update on <strong>{unit}</strong>. I've updated the record as <strong>{reason}</strong>. Do reach out if your plans change.<br><br>Best regards,<br>Bharat Properties`,
        shared: true
    },
    {
        id: 'fb_busy_driving',
        name: 'Feedback: Busy / Driving',
        author: 'System',
        tags: ['Feedback', 'Inventory'],
        subject: 'Missed you regarding {unit}',
        content: `Hi {owner},<br><br>I tried reaching you regarding <strong>{unit}</strong>. Seems like you were busy — I'll call again shortly.<br><br>Best regards,<br>Bharat Properties`,
        shared: true
    },
    {
        id: 'fb_switch_off',
        name: 'Feedback: Switch Off / Unreachable',
        author: 'System',
        tags: ['Feedback', 'Inventory'],
        subject: 'Tried reaching you for {unit}',
        content: `Hi {owner},<br><br>We tried contacting you regarding <strong>{unit}</strong> but were unable to reach you. We will try again at a later time.<br><br>Best regards,<br>Bharat Properties`,
        shared: true
    },
    {
        id: 'fb_market_feedback',
        name: 'Feedback: Market Feedback',
        author: 'System',
        tags: ['Feedback', 'Inventory'],
        subject: 'Market update for {unit}',
        content: `Hi {owner},<br><br>Thank you for sharing your thoughts on <strong>{unit}</strong>. If you decide to sell or rent, we have active buyers ready. Feel free to reach out anytime.<br><br>Best regards,<br>Bharat Properties`,
        shared: true
    },
    {
        id: 'fb_general_inquiry',
        name: 'Feedback: General Inquiry',
        author: 'System',
        tags: ['Feedback', 'Inventory'],
        subject: 'Your inquiry regarding {unit}',
        content: `Hi {owner},<br><br>Thank you for your inquiry regarding <strong>{unit}</strong>. Our team will get back to you shortly with the requested information.<br><br>Best regards,<br>Bharat Properties`,
        shared: true
    },
    {
        id: 'fb_wrong_number',
        name: 'Feedback: Wrong Number / Invalid',
        author: 'System',
        tags: ['Feedback', 'Inventory'],
        subject: 'Contact verification for {unit}',
        content: `Hi,<br><br>We attempted to contact the registered owner for <strong>{unit}</strong> but the number appears to be incorrect or unavailable. Our team will verify and update the records.<br><br>Best regards,<br>Bharat Properties`,
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
    },
    {
        id: 'fb_interested_hot_wa',
        name: 'Feedback: Interested (Hot)',
        content: "Hi {owner}, great to hear from you regarding {unit}! I'm finalizing the details for our {time} meeting. Please keep the original documents ready.",
        tags: ['Feedback', 'Inventory']
    },
    {
        id: 'fb_interested_warm_wa',
        name: 'Feedback: Interested (Warm)',
        content: "Hi {owner}, thank you for your time discussing {unit}. I've noted your interest for {reason}. I will share some market comparisons shortly.",
        tags: ['Feedback', 'Inventory']
    },
    {
        id: 'fb_callback_wa',
        name: 'Feedback: Request Call Back',
        content: "Hi {owner}, apologies for the interruption. I will call you back at {time} regarding {unit} as requested.",
        tags: ['Feedback', 'Inventory']
    },
    {
        id: 'fb_not_interested_wa',
        name: 'Feedback: Not Interested',
        content: "Hi {owner}, thank you for the update on {unit}. I've updated the record as {reason}. Do reach out if your plans change.",
        tags: ['Feedback', 'Inventory']
    },
    {
        id: 'fb_busy_driving_wa',
        name: 'Feedback: Busy / Driving',
        content: "Hi {owner}, I tried calling you regarding {unit}. I'll reach out again later today. Sorry for the interruption.",
        tags: ['Feedback', 'Inventory']
    },
    {
        id: 'fb_switch_off_wa',
        name: 'Feedback: Switch Off / Unreachable',
        content: "Hi {owner}, we tried reaching you about {unit} but couldn't connect. We'll try again soon. Please call us back at your convenience.",
        tags: ['Feedback', 'Inventory']
    },
    {
        id: 'fb_market_feedback_wa',
        name: 'Feedback: Market Feedback',
        content: "Hi {owner}, thank you for the insight on {unit}. If you decide to proceed with sale or rent, I have active buyers ready. Do keep us in mind!",
        tags: ['Feedback', 'Inventory']
    },
    {
        id: 'fb_general_inquiry_wa',
        name: 'Feedback: General Inquiry',
        content: "Hi {owner}, thank you for your inquiry about {unit}. Our team will get back to you shortly with the details you requested.",
        tags: ['Feedback', 'Inventory']
    },
    {
        id: 'fb_wrong_number_wa',
        name: 'Feedback: Wrong Number / Invalid',
        content: "Hi, we tried reaching the registered contact for {unit} but the number seems incorrect. Please help us update the contact details.",
        tags: ['Feedback', 'Inventory']
    },
    {
        id: 11,
        name: 'property_match_alert',
        content: `Hi {{1}}! 🏠

We found an exclusive property match that aligns perfectly with your requirements:

{{2}}

Would you like to schedule a priority site visit or receive more details?

Best regards,
{{3}}
Bharat Properties`,
        tags: ['Property', 'Match Alert']
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
        name: 'Deal Property Match',
        body: 'Hi {{firstName}}, exclusive property match! {{projectName}} in {{location}}. Size: {{size}}, Price: {{price}}. Reply YES for priority visit. - Bharat Properties',
        tags: ['Deal Match', 'Priority']
    },
    {
        id: 'fb_interested_hot_sms',
        name: 'Feedback: Interested (Hot)',
        body: "{unit} Update: Hi {owner}, finalized meeting for {time}. Please keep documents ready.",
        tags: ['Feedback', 'Inventory']
    },
    {
        id: 'fb_interested_warm_sms',
        name: 'Feedback: Interested (Warm)',
        body: "Hi {owner}, thanks for discussing {unit}. Noted your interest as {reason}. Will share details soon.",
        tags: ['Feedback', 'Inventory']
    },
    {
        id: 'fb_callback_sms',
        name: 'Feedback: Request Call Back',
        body: "Hi {owner}, will call you back at {time} regarding {unit}. Sorry for the interruption.",
        tags: ['Feedback', 'Inventory']
    },
    {
        id: 'fb_not_interested_sms',
        name: 'Feedback: Not Interested',
        body: "Hi {owner}, noted on {unit} as {reason}. Reach out if plans change. Thanks.",
        tags: ['Feedback', 'Inventory']
    },
    {
        id: 'fb_busy_driving_sms',
        name: 'Feedback: Busy / Driving',
        body: "Hi {owner}, tried calling for {unit}. Will call again later. Thanks — Bharat Properties",
        tags: ['Feedback', 'Inventory']
    },
    {
        id: 'fb_switch_off_sms',
        name: 'Feedback: Switch Off / Unreachable',
        body: "Hi, we tried reaching the contact for {unit} but couldn't connect. Please call us back. - Bharat Properties",
        tags: ['Feedback', 'Inventory']
    },
    {
        id: 'fb_market_feedback_sms',
        name: 'Feedback: Market Feedback',
        body: "Hi {owner}, thanks for feedback on {unit}. Contact us if you decide to sell/rent. Active buyers ready — Bharat Properties",
        tags: ['Feedback', 'Inventory']
    },
    {
        id: 'fb_general_inquiry_sms',
        name: 'Feedback: General Inquiry',
        body: "Hi {owner}, noted your inquiry on {unit}. Our team will connect shortly. - Bharat Properties",
        tags: ['Feedback', 'Inventory']
    },
    {
        id: 'fb_wrong_number_sms',
        name: 'Feedback: Wrong Number / Invalid',
        body: "Contact mismatch for {unit}. Please share correct owner number. - Bharat Properties",
        tags: ['Feedback', 'Inventory']
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
