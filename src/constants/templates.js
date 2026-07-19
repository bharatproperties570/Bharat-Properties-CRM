export const emailTemplates = [
    {
        id: 1,
        name: 'Welcome & Discovery',
        author: 'Bharat Properties',
        visibility: 'Owned by everyone',
        tags: ['Welcome', 'Leads'],
        subject: '👋 Welcome to Bharat Properties | Let\'s find your dream home!',
        content: `Dear {{first_name}},<br><br>Thank you for choosing <strong>Bharat Properties</strong>. We are thrilled to assist you in your journey to find the perfect property.<br><br>Our mission is to provide you with a seamless and transparent real estate experience. One of our senior consultants will reach out to you shortly to understand your requirements in detail.<br><br>In the meantime, feel free to browse our latest premium listings on our website.<br><br>Best regards,<br>{{agent_name}}`,
        shared: true
    },
    {
        id: 2,
        name: 'Top Matches Priority',
        author: 'Bharat Properties',
        visibility: 'Owned by everyone',
        tags: ['Leads', 'Priority'],
        subject: '🔥 Exclusive Selection: Top property matches for you!',
        content: `Dear {{first_name}},<br><br>Based on our latest market analysis, we have identified these <strong>Top Property Matches</strong> that perfectly align with your requirements.<br><br>{{property_list}}<br><br>These properties are currently seeing high interest. Would you like to schedule a priority visit this weekend?<br><br>Best regards,<br>{{agent_name}}`,
        shared: true
    },
    {
        id: 3,
        name: 'Visit Confirmation',
        author: 'Bharat Properties',
        visibility: 'Owned by everyone',
        tags: ['Site Visit'],
        subject: '✅ Confirmed: Your Property Visit for {{property_list}}',
        content: `Hello {{first_name}},<br><br>Your site visit has been successfully scheduled. Here are the details:<br><br>📍 <strong>Location:</strong> {{property_list}}<br>📅 <strong>Date & Time:</strong> [Insert Selection]<br>👤 <strong>Assigned Executive:</strong> {{agent_name}}<br><br>We recommend arriving 5 minutes early. If you need a pickup or directions, please reply to this email or call us directly.<br><br>Looking forward to showing you your potential future home!<br><br>Best regards,<br>{{agent_name}}`,
        shared: true
    },
    {
        id: 4,
        name: 'Post-Visit Feedback',
        author: 'Bharat Properties',
        visibility: 'Owned by everyone',
        tags: ['Follow-up'],
        subject: '🏠 Thoughts on your recent visit? | Next steps for {{property_list}}',
        content: `Dear {{first_name}},<br><br>It was a pleasure meeting you during our visit to <strong>{{property_list}}</strong> today. We would love to hear your thoughts on the property.<br><br>Did the unit meet your expectations, or would you like to explore other options in a similar range?<br><br><strong>Next Steps:</strong> We can initiate the negotiation process if you liked this unit, or I can share 2-3 alternative listings by tomorrow morning.<br><br>Waiting for your feedback.<br><br>Best regards,<br>{{agent_name}}`,
        shared: true
    },
    {
        id: 5,
        name: 'Market Update / Re-engagement',
        author: 'Bharat Properties',
        visibility: 'Owned by everyone',
        tags: ['Re-engagement'],
        subject: '💎 New inventory just landed! | Are you still looking in {{property_location}}?',
        content: `Hi {{first_name}},<br><br>It's been a while since we last spoke! I wanted to give you a quick heads-up that some <strong>exclusive new inventory</strong> has just opened up in {{property_location}} that matches your previous preferences.<br><br>Before these hit the public portals, would you like to see the details?<br><br>Looking forward to reconnecting.<br><br>Best regards,<br>{{agent_name}}`,
        shared: true
    },
    {
        id: 6,
        name: 'Booking Success',
        author: 'Bharat Properties',
        visibility: 'Owned by everyone',
        tags: ['Deals', 'Success'],
        subject: '🎉 Congratulations on your new home at {{company_name}}!',
        content: `Dear {{first_name}},<br><br><div style="text-align: center; padding: 20px; background: #f0fdf4; border-radius: 12px; border: 1px solid #bbf7d0;"><h2>🎉 CONGRATULATIONS!</h2><p>Your booking for the unit at <strong>{{company_name}}</strong> has been successfully processed.</p></div><br>This is a major milestone, and we are honored to be part of it. Our post-sales team will guide you through the documentation and registry process shortly.<br><br>Welcome to the Bharat Properties family!<br><br>Best regards,<br>{{agent_name}}`,
        shared: true
    },
    {
        id: 7,
        name: 'Document Request',
        author: 'Bharat Properties',
        visibility: 'Owned by everyone',
        tags: ['Operations'],
        subject: '📄 Action Required: Documentation for {{first_name}}',
        content: `Dear {{first_name}},<br><br>To proceed with your application for {{company_name}}, we require the following documents at your earliest convenience:<br><br>✅ PAN Card Copy<br>✅ Aadhaar Card (Front & Back)<br>✅ Passport Size Photograph<br>✅ Booking Cheque/Transaction Receipt<br><br>Please reply to this email with the scanned copies or WhatsApp them to us at +91-XXXXX-XXXXX.<br><br>Keeping these ready will ensure a smooth and priority processing of your file.<br><br>Best regards,<br>{{agent_name}}`,
        shared: true
    },
    {
        id: 8,
        name: 'Deal Property Match',
        author: 'Bharat Properties',
        visibility: 'Owned by everyone',
        tags: ['Deal Match', 'Priority', 'Leads'],
        subject: '🏠 Exclusive Property Match Found for You | {{project_name}}',
        systemContext: ['deal_match', 'deal_match_modal'],
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
    <p style="margin: 0 0 6px; font-size: 15px; color: #475569;">Dear <strong style="color: #1e293b;">{{first_name}}</strong>,</p>
    <p style="margin: 0; font-size: 14px; color: #64748b; line-height: 1.7;">I am pleased to share an exclusive property opportunity that perfectly aligns with your investment goals and lifestyle requirements. This unit is currently available and seeing strong buyer interest — I recommend reviewing it at the earliest convenience.</p>
  </div>

  <!-- Property Card -->
  <div style="background: #ffffff; padding: 24px 40px 32px;">

    <!-- Project Name Banner -->
    <div style="background: linear-gradient(135deg, #f0f9ff, #e0f2fe); border: 1px solid #bae6fd; border-radius: 12px; padding: 20px 24px; margin-bottom: 20px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td valign="top" style="padding-bottom: 12px; text-align: left;">
            <div style="font-size: 11px; font-weight: 700; color: #0284c7; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;">📍 Project</div>
            <div style="font-size: 22px; font-weight: 900; color: #0c4a6e; margin: 0; word-break: break-word;">{{project_name}}</div>
            <div style="font-size: 13px; color: #0369a1; margin-top: 4px; font-weight: 600;">{{property_location}}</div>
          </td>
          <td valign="top" style="text-align: right;">
            <div style="font-size: 11px; font-weight: 700; color: #059669; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;">💰 Asking Price</div>
            <div style="font-size: 24px; font-weight: 900; color: #065f46;">{{property_price}}</div>
            <div style="font-size: 11px; color: #6b7280; margin-top: 3px; font-weight: 600;">All Inclusive</div>
          </td>
        </tr>
      </table>
    </div>

    <!-- Property Details Grid (Mobile Friendly Fluid Blocks) -->
    <div style="margin-bottom: 12px; text-align: left; font-size: 0;">

      <!-- Row 1 -->
      <div style="display: inline-block; width: 100%; max-width: 270px; vertical-align: top; margin-bottom: 12px; margin-right: 10px;">
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; font-size: 14px;">
          <div style="font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px;">🏗 Unit Number</div>
          <div style="font-size: 16px; font-weight: 800; color: #1e293b; word-break: break-word;">{{unit_number}}</div>
        </div>
      </div>

      <div style="display: inline-block; width: 100%; max-width: 270px; vertical-align: top; margin-bottom: 12px;">
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; font-size: 14px;">
          <div style="font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px;">🏠 Category</div>
          <div style="font-size: 15px; font-weight: 800; color: #1e293b; word-break: break-word;">{{property_category}}</div>
        </div>
      </div>

      <!-- Row 2 -->
      <div style="display: inline-block; width: 100%; max-width: 270px; vertical-align: top; margin-bottom: 12px; margin-right: 10px;">
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; font-size: 14px;">
          <div style="font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px;">🏷 Type / Specification</div>
          <div style="font-size: 15px; font-weight: 800; color: #1e293b; word-break: break-word;">{{property_subcategory}}</div>
        </div>
      </div>

      <div style="display: inline-block; width: 100%; max-width: 270px; vertical-align: top; margin-bottom: 12px;">
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; font-size: 14px;">
          <div style="font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px;">🏢 Block / Floor</div>
          <div style="font-size: 15px; font-weight: 800; color: #1e293b; word-break: break-word;">{{block_name}}</div>
        </div>
      </div>

      <!-- Row 3 -->
      <div style="display: inline-block; width: 100%; max-width: 270px; vertical-align: top; margin-bottom: 12px; margin-right: 10px;">
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; font-size: 14px;">
          <div style="font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px;">📜 Ownership</div>
          <div style="font-size: 15px; font-weight: 800; color: #1e293b; word-break: break-word;">{{property_subcategory}}</div>
        </div>
      </div>

      <div style="display: inline-block; width: 100%; max-width: 270px; vertical-align: top; margin-bottom: 12px;">
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; font-size: 14px;">
          <div style="font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px;">📐 Size Type</div>
          <div style="font-size: 15px; font-weight: 800; color: #1e293b; word-break: break-word;">{{size_label}}</div>
        </div>
      </div>
    </div>

    {{property_list_detailed}}

    <div style="background: #fefce8; border: 1px solid #fde68a; border-radius: 10px; padding: 14px 16px; margin-bottom: 20px;">
      <div style="font-size: 10px; font-weight: 700; color: #92400e; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px;">📊 Availability Status</div>
      <div style="font-size: 15px; font-weight: 800; color: #78350f; word-break: break-word;">{{lead_stage}}</div>
    </div>

    {{property_list_detailed}}

    <!-- Why This Property -->
    <div style="background: linear-gradient(135deg, #faf5ff, #ede9fe); border: 1px solid #ddd6fe; border-radius: 12px; padding: 20px 24px; margin-bottom: 20px;">
      <div style="font-size: 13px; font-weight: 800; color: #5b21b6; margin-bottom: 12px;">
        <span style="vertical-align: middle; margin-right: 6px;">✨</span> <span style="vertical-align: middle;">Why This Property Matches You</span>
      </div>
      <div style="display: block;">
        <div style="margin-bottom: 10px;">
          <div style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #7c3aed; margin-right: 10px; vertical-align: middle;"></div>
          <span style="display: inline-block; width: 90%; font-size: 13px; color: #374151; font-weight: 600; vertical-align: middle; word-break: break-word;">Location matches your preferred area in <strong>{{property_location}}</strong></span>
        </div>
        <div style="margin-bottom: 10px;">
          <div style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #7c3aed; margin-right: 10px; vertical-align: middle;"></div>
          <span style="display: inline-block; width: 90%; font-size: 13px; color: #374151; font-weight: 600; vertical-align: middle; word-break: break-word;">Asking price of <strong>{{property_price}}</strong> is aligned with your budget range</span>
        </div>
        <div style="margin-bottom: 10px;">
          <div style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #7c3aed; margin-right: 10px; vertical-align: middle;"></div>
          <span style="display: inline-block; width: 90%; font-size: 13px; color: #374151; font-weight: 600; vertical-align: middle; word-break: break-word;">Property type and size configuration suit your stated requirements</span>
        </div>
        <div style="margin-bottom: 10px;">
          <div style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #7c3aed; margin-right: 10px; vertical-align: middle;"></div>
          <span style="display: inline-block; width: 90%; font-size: 13px; color: #374151; font-weight: 600; vertical-align: middle; word-break: break-word;">Currently <strong>{{lead_stage}}</strong> — act quickly to secure this unit</span>
        </div>
      </div>
    </div>

    <!-- Urgency Banner -->
    <div style="background: linear-gradient(135deg, #fff7ed, #ffedd5); border: 1px solid #fed7aa; border-radius: 12px; padding: 16px 20px; margin-bottom: 24px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td width="30" valign="top" style="font-size: 20px; padding-right: 12px;">⏰</td>
          <td valign="top">
            <div style="font-size: 13px; font-weight: 800; color: #9a3412; margin-bottom: 2px;">Limited Availability — Priority Booking Open</div>
            <div style="font-size: 12px; color: #c2410c; font-weight: 500;">This unit is being shared with a select group of serious buyers. Please confirm your interest to hold priority.</div>
          </td>
        </tr>
      </table>
    </div>

    <!-- CTA Buttons -->
    <div style="text-align: center; margin-bottom: 24px;">
      <a href="https://crm.bharatproperties.co/public/form/standard-project-tour-scheduler-bqnh6" style="display: inline-block; background: linear-gradient(135deg, #2563eb, #1d4ed8); color: #ffffff; padding: 14px 32px; border-radius: 50px; text-decoration: none; font-size: 14px; font-weight: 800; letter-spacing: 0.3px; box-shadow: 0 4px 15px rgba(37,99,235,0.35); margin-right: 10px; margin-bottom: 10px;">
        📅 Schedule Visit
      </a>
      <a href="https://wa.me/91{{agent_mobile}}?text=Hi%2C%20I'm%20interested%20in%20the%20property%20%2A{{project_name}}%2A%20at%20%2A{{property_location}}%2A." style="display: inline-block; background: linear-gradient(135deg, #25d366, #128c7e); color: #ffffff; padding: 14px 32px; border-radius: 50px; text-decoration: none; font-size: 14px; font-weight: 800; letter-spacing: 0.3px; box-shadow: 0 4px 15px rgba(37,211,102,0.35); margin-bottom: 10px;">
        💬 WhatsApp Us
      </a>
    </div>

    <!-- Divider -->
    <div style="border-top: 1px solid #e2e8f0; margin: 8px 0 24px;"></div>

    <!-- Closing -->
    <p style="font-size: 14px; color: #475569; line-height: 1.7; margin: 0 0 16px;">I am available for a detailed walkthrough at your preferred time. Please feel free to reach out, and I will ensure a seamless experience from property viewing to documentation.</p>
    <p style="font-size: 14px; color: #475569; margin: 0 0 6px;">Warm regards,</p>
    <strong style="font-size: 15px; color: #1e293b;">{{agent_name}}</strong>
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
        content: `Hi {{full_name}},<br><br>Great to hear from you regarding <strong>{{unit_number}}</strong>! I'm finalizing the details for our <strong>{{due_date}}</strong> meeting. Please keep the original documents ready.<br><br>Best regards,<br>Bharat Properties`,
        shared: true
    },
    {
        id: 'fb_interested_warm',
        name: 'Feedback: Interested (Warm)',
        author: 'System',
        tags: ['Feedback', 'Inventory'],
        subject: 'Interest noted for {unit}',
        content: `Hi {{full_name}},<br><br>Thank you for your time discussing <strong>{{unit_number}}</strong>. I've noted your interest for <strong>{{lead_status}}</strong>. I will share some market comparisons shortly.<br><br>Best regards,<br>Bharat Properties`,
        shared: true
    },
    {
        id: 'fb_callback',
        name: 'Feedback: Request Call Back',
        author: 'System',
        tags: ['Feedback', 'Inventory'],
        subject: 'Call back request for {unit}',
        content: `Hi {{full_name}},<br><br>Apologies for the interruption. I will call you back at <strong>{{due_date}}</strong> regarding <strong>{{unit_number}}</strong> as requested.<br><br>Best regards,<br>Bharat Properties`,
        shared: true
    },
    {
        id: 'fb_not_interested',
        name: 'Feedback: Not Interested',
        author: 'System',
        tags: ['Feedback', 'Inventory'],
        subject: 'Status update for {unit}',
        content: `Hi {{full_name}},<br><br>Thank you for the update on <strong>{{unit_number}}</strong>. I've updated the record as <strong>{{lead_status}}</strong>. Do reach out if your plans change.<br><br>Best regards,<br>Bharat Properties`,
        shared: true
    },
    {
        id: 'fb_busy_driving',
        name: 'Feedback: Busy / Driving',
        author: 'System',
        tags: ['Feedback', 'Inventory'],
        subject: 'Missed you regarding {unit}',
        content: `Hi {{full_name}},<br><br>I tried reaching you regarding <strong>{{unit_number}}</strong>. Seems like you were busy — I'll call again shortly.<br><br>Best regards,<br>Bharat Properties`,
        shared: true
    },
    {
        id: 'fb_switch_off',
        name: 'Feedback: Switch Off / Unreachable',
        author: 'System',
        tags: ['Feedback', 'Inventory'],
        subject: 'Tried reaching you for {unit}',
        content: `Hi {{full_name}},<br><br>We tried contacting you regarding <strong>{{unit_number}}</strong> but were unable to reach you. We will try again at a later time.<br><br>Best regards,<br>Bharat Properties`,
        shared: true
    },
    {
        id: 'fb_market_feedback',
        name: 'Feedback: Market Feedback',
        author: 'System',
        tags: ['Feedback', 'Inventory'],
        subject: 'Market update for {unit}',
        content: `Hi {{full_name}},<br><br>Thank you for sharing your thoughts on <strong>{{unit_number}}</strong>. If you decide to sell or rent, we have active buyers ready. Feel free to reach out anytime.<br><br>Best regards,<br>Bharat Properties`,
        shared: true
    },
    {
        id: 'fb_general_inquiry',
        name: 'Feedback: General Inquiry',
        author: 'System',
        tags: ['Feedback', 'Inventory'],
        subject: 'Your inquiry regarding {unit}',
        content: `Hi {{full_name}},<br><br>Thank you for your inquiry regarding <strong>{{unit_number}}</strong>. Our team will get back to you shortly with the requested information.<br><br>Best regards,<br>Bharat Properties`,
        shared: true
    },
    {
        id: 'fb_wrong_number',
        name: 'Feedback: Wrong Number / Invalid',
        author: 'System',
        tags: ['Feedback', 'Inventory'],
        subject: 'Contact verification for {unit}',
        content: `Hi,<br><br>We attempted to contact the registered owner for <strong>{{unit_number}}</strong> but the number appears to be incorrect or unavailable. Our team will verify and update the records.<br><br>Best regards,<br>Bharat Properties`,
        shared: true
    },
    // --- NEW TEMPLATES FROM TEMPLATE CONTEXT ---
    {
        id: 'tpl_drip_day3_trust',
        name: 'Drip Day 3 - Top 5 Reasons',
        author: 'Bharat Properties',
        visibility: 'Owned by everyone',
        tags: ['Drip', 'Nurture'],
        subject: 'Top 5 reasons to invest in {{project_name}}',
        content: `Dear {{first_name}},<br><br>Still thinking about your real estate investment? Here are the top 5 reasons why our project is considered the best choice by experts:<br><br>1. Prime Location<br>2. High ROI<br>3. Premium Amenities<br>4. RERA Approved<br>5. Trusted Builder<br><br>Reply to this email to book a free consultation!<br><br>Best regards,<br>{{agent_name}}`,
        shared: true
    },
    {
        id: 'tpl_post_sales_anniversary',
        name: 'Post-Sales - 1 Year Anniversary',
        author: 'Bharat Properties',
        visibility: 'Owned by everyone',
        tags: ['Post-Sales', 'Automated'],
        subject: '🎉 Happy 1st Anniversary of your Booking!',
        content: `Dear {{first_name}},<br><br>Happy 1st Anniversary of joining our community! 🎉 It has been a wonderful year building your dream home.<br><br>We are organizing a special get-together for all future residents next month. Stay tuned for the invite!<br><br>Best regards,<br>{{agent_name}}`,
        shared: true
    }
];

export const whatsappTemplates = [
    {
        id: 1,
        name: 'Property Presentation',
        content: `Hi {{first_name}}! 🏠

I found a *{{property_category}}* that matches your requirement perfectly!

📍 *Location:* {{property_location}}
📏 *Size:* {{property_size}}
💰 *Price:* ₹{{property_price}}
✨ *Highlights:* {{property_list_default}}

🔗 View Details: {{property_list_detailed}}

This property is getting high interest. Would you like to schedule a visit this weekend?

Best regards,
*{{agent_name}}*
Bharat Properties
📞 {{agent_mobile}}`,
        tags: ['Property', 'Lead Nurturing']
    },
    {
        id: 2,
        name: 'Property Portfolio',
        content: `Hi {{first_name}},

As discussed, I've curated a portfolio of *{{properties_count}} premium properties* specifically matching your requirements. 🏠💼

{{property_list}}

I'd love to discuss these further and schedule visits for your top choices.

*Which one stands out to you the most?*

Looking forward to your feedback!

Best regards,
*{{agent_name}}*
Bharat Properties
📞 {{agent_mobile}}`,
        tags: ['Property', 'Portfolio']
    },
    {
        id: 3,
        name: 'Exclusive Deal Alert',
        content: `🔥 *EXCLUSIVE OPPORTUNITY* 🔥

Hi {{first_name}},

A *{{property_category}}* just became available in *{{property_location}}* that perfectly matches your requirements!

💎 *Key Details:*
📏 Size: {{property_size}}
💰 Price: ₹{{property_price}}
🎯 Match Score: {{match_percentage}}%

⚡ *Why this is perfect for you:*
{{requirement_summary}}

This won't last long - {{properties_count}} other buyers are already interested!

*Can we schedule a viewing today or tomorrow?*

Best regards,
*{{agent_name}}*
Bharat Properties
📞 {{agent_mobile}}`,
        tags: ['Deal', 'Urgent']
    },
    {
        id: 4,
        name: 'Site Visit Invitation',
        content: `Hi {{first_name}}! 👋

Great news! The *{{property_category}}* in *{{property_location}}* is available for viewing.

📅 *Suggested Visit Slots:*
• {{due_date}}
• {{due_date}}
• {{due_date}}

I'll personally accompany you and share insider details about the property and neighborhood.

*Which slot works best for you?*

Just reply with the number (1, 2, or 3) and I'll confirm immediately!

See you soon,
*{{agent_name}}*
Bharat Properties
📞 {{agent_mobile}}`,
        tags: ['Site Visit', 'Action']
    },
    {
        id: 5,
        name: 'Quick Inquiry Response',
        content: `Hi {{first_name}}! 😊

Thank you for your inquiry about *{{property_category}}* in *{{property_location}}*!

I've received your requirements:
{{requirement_summary}}

✅ *Good news!* We have {{properties_count}} properties that match your criteria.

I'm preparing a curated list for you. Meanwhile, could you confirm:
1. Your preferred budget range?
2. Timeline for purchase?
3. Any specific must-haves?

I'll get back to you within 30 minutes with the best options!

Best regards,
*{{agent_name}}*
Bharat Properties
📞 {{agent_mobile}}`,
        tags: ['Inquiry', 'Response']
    },
    {
        id: 6,
        name: 'Follow-up After Site Visit',
        content: `Hi {{first_name}},

Thank you for visiting *{{project_name}}* with me today! 🏠

I hope you liked what you saw. Here's a quick summary:

✅ *What you loved:* {{lead_status}}
🤔 *Your concerns:* {{lead_requirement}}

*Next Steps:*
{{lead_stage}}

Feel free to call me anytime if you have questions.

Best regards,
*{{agent_name}}*
Bharat Properties
📞 {{agent_mobile}}`,
        tags: ['Follow-up', 'Site Visit']
    },
    {
        id: 7,
        name: 'Welcome Message',
        content: `Welcome to Bharat Properties, {{first_name}}! 🎉

I'm *{{agent_name}}*, your dedicated property consultant.

🏆 *What I'll help you with:*
✓ Find properties matching your exact needs
✓ Arrange site visits at your convenience
✓ Negotiate the best prices
✓ Handle all documentation

📱 *How to reach me:*
• WhatsApp: {{agent_mobile}} (Fastest!)
• Call: {{agent_mobile}}
• Email: {{agent_email}}

*What type of property are you looking for?*

Let's find your dream property together!

Best regards,
*{{agent_name}}*
Bharat Properties`,
        tags: ['Welcome', 'Onboarding']
    },
    {
        id: 8,
        name: 'Price Drop Alert',
        content: `🔔 *PRICE DROP ALERT!* 🔔

Hi {{first_name}},

Remember the *{{property_category}}* in *{{property_location}}* you were interested in?

*Great news!* The price has been reduced:

~~₹{{property_price}}~~ → *₹{{property_price}}*

💰 *You save: ₹{{property_price}}!*

This is a limited-time opportunity. The owner needs to close quickly.

*Interested? Let's schedule a visit ASAP!*

Best regards,
*{{agent_name}}*
Bharat Properties
📞 {{agent_mobile}}`,
        tags: ['Price Drop', 'Urgent']
    },
    {
        id: 9,
        name: 'Document Request',
        content: `Hi {{first_name}},

To proceed with your *{{property_category}}* booking in *{{property_location}}*, we need the following documents:

📄 *Required Documents:*
{{document_list}}

*How to submit:*
Simply click photos and send them via WhatsApp to this number.

⏰ *Timeline:* Please share by {{due_date}} to secure the property.

Let me know if you need any clarification!

Best regards,
*{{agent_name}}*
Bharat Properties
📞 {{agent_mobile}}`,
        tags: ['Documentation', 'Transaction']
    },
    {
        id: 10,
        name: 'Payment Reminder',
        content: `Hi {{first_name}},

This is a friendly reminder about your upcoming payment for *{{project_name}}*.

💰 *Payment Details:*
Amount: ₹{{amount}}
Due Date: {{due_date}}
Payment Type: {{lead_status}}

*Payment Options:*
{{lead_status}}

Please confirm once done. Let me know if you need any assistance!

Best regards,
*{{agent_name}}*
Bharat Properties
📞 {{agent_mobile}}`,
        tags: ['Payment', 'Reminder']
    },
    {
        id: 'fb_interested_hot_wa',
        name: 'Feedback: Interested (Hot)',
        content: "Hi {owner}, great to hear from you regarding {{unit_number}}! I'm finalizing the details for our {{due_date}} meeting. Please keep the original documents ready.",
        tags: ['Feedback', 'Inventory']
    },
    {
        id: 'fb_interested_warm_wa',
        name: 'Feedback: Interested (Warm)',
        content: "Hi {owner}, thank you for your time discussing {{unit_number}}. I've noted your interest for {{lead_status}}. I will share some market comparisons shortly.",
        tags: ['Feedback', 'Inventory']
    },
    {
        id: 'fb_callback_wa',
        name: 'Feedback: Request Call Back',
        content: "Hi {owner}, apologies for the interruption. I will call you back at {{due_date}} regarding {{unit_number}} as requested.",
        tags: ['Feedback', 'Inventory']
    },
    {
        id: 'fb_not_interested_wa',
        name: 'Feedback: Not Interested',
        content: "Hi {owner}, thank you for the update on {{unit_number}}. I've updated the record as {{lead_status}}. Do reach out if your plans change.",
        tags: ['Feedback', 'Inventory']
    },
    {
        id: 'fb_busy_driving_wa',
        name: 'Feedback: Busy / Driving',
        content: "Hi {owner}, I tried calling you regarding {{unit_number}}. I'll reach out again later today. Sorry for the interruption.",
        tags: ['Feedback', 'Inventory']
    },
    {
        id: 'fb_switch_off_wa',
        name: 'Feedback: Switch Off / Unreachable',
        content: "Hi {owner}, we tried reaching you about {{unit_number}} but couldn't connect. We'll try again soon. Please call us back at your convenience.",
        tags: ['Feedback', 'Inventory']
    },
    {
        id: 'fb_market_feedback_wa',
        name: 'Feedback: Market Feedback',
        content: "Hi {owner}, thank you for the insight on {{unit_number}}. If you decide to proceed with sale or rent, I have active buyers ready. Do keep us in mind!",
        tags: ['Feedback', 'Inventory']
    },
    {
        id: 'fb_general_inquiry_wa',
        name: 'Feedback: General Inquiry',
        content: "Hi {owner}, thank you for your inquiry about {{unit_number}}. Our team will get back to you shortly with the details you requested.",
        tags: ['Feedback', 'Inventory']
    },
    {
        id: 'fb_wrong_number_wa',
        name: 'Feedback: Wrong Number / Invalid',
        content: "Hi, we tried reaching the registered contact for {unit} but the number seems incorrect. Please help us update the contact details.",
        tags: ['Feedback', 'Inventory']
    },
    {
        id: 'tpl_deal_match_wa',
        name: 'Deal Property Match',
        systemContext: ['deal_match', 'deal_match_modal'],
        category: 'UTILITY',
        language: 'en',
        content: `Dear {{first_name}},\n\nWe have identified a property that aligns with your criteria.\n\nProject: {{project_name}}\nLocation: {{property_location}}\nPrice: {{property_price}}\n\nPlease let us know if you would like to schedule a viewing or require further details.\n\nRegards,\n{{agent_name}}\nBharat Properties`,
        tags: ['Deal Match', 'Utility']
    },
    // --- NEW WHATSAPP TEMPLATES ---
    {
        id: 'tpl_drip_day7_video',
        name: 'Drip Day 7 - Virtual Tour',
        category: 'MARKETING',
        language: 'en',
        content: `Hello {{first_name}} 👋,\nTake a VIP Virtual Tour of our Sample Flat right from your phone! 📱\nClick here to watch: [Video Link]\nLet me know what you think! - {{agent_name}}`
    },
    {
        id: 'tpl_drip_day14_urgency',
        name: 'Drip Day 14 - Scarcity Offer',
        category: 'MARKETING',
        language: 'en',
        content: `Hi {{first_name}}! ⏳ Just 3 corner-units left in Phase 1. If you book a site visit this weekend, we will arrange a complimentary cab pick-up. 🚖 Reply "YES" to claim.`
    },
    {
        id: 'tpl_post_sales_welcome',
        name: 'Post-Sales - Welcome Home',
        category: 'UTILITY',
        language: 'en',
        content: `Congratulations {{first_name}}! 🎊 Welcome to the Bharat Properties family. We have successfully registered your booking. Here is a link to your Next Steps and Payment Schedule document: [Doc Link]. Please reach out if you need any assistance!`
    },
    {
        id: 'tpl_post_sales_update_m1',
        name: 'Post-Sales - Month 1 Construction',
        category: 'UTILITY',
        language: 'en',
        content: `Hi {{first_name}}, hope you are doing great! 🏗️ Here is the Month 1 construction update for your future home. The foundation work is 80% complete! See live photos here: [Photos Link]`
    },
    {
        id: 'tpl_referral_request',
        name: 'Referral - Infinite Marketing Loop',
        category: 'MARKETING',
        language: 'en',
        content: `Hello {{first_name}}! 🌟 We hope you are excited about your new investment. Did you know you can earn rewards? Refer a friend using your unique link: [Referral Link]. If they book, YOU get a free modular kitchen upgrade! 🎁 Share it today!`
    }
];

export const smsTemplates = [
    {
        id: 1,
        name: 'Property Alert',
        body: 'Hi {{first_name}}, New {{property_category}} available in {{property_location}}! Size: {{property_size}}, Price: Rs{{property_price}}. Visit: {{property_list_detailed}}. Call {{agent_mobile}} - Bharat Properties',
        tags: ['Property', 'Alert']
    },
    {
        id: 2,
        name: 'Site Visit Confirmation',
        body: 'Hi {{first_name}}, Your site visit for {{property_category}} at {{property_location}} is confirmed for {{property_size}}. Agent {{property_price}} will meet you. Call {{property_list_detailed}} for changes. - Bharat Properties',
        tags: ['Site Visit', 'Confirmation']
    },
    {
        id: 3,
        name: 'Quick Follow-up',
        body: 'Hi {{first_name}}, Following up on {{property_category}} in {{property_location}}. Still interested? We have {{property_size}} similar options. Reply YES or call {{property_price}} - {{property_list_detailed}}, Bharat Properties',
        tags: ['Follow-up']
    },
    {
        id: 4,
        name: 'Document Reminder',
        body: 'Hi {{first_name}}, Reminder: Please submit {{property_category}} for {{property_location}} booking by {{property_size}}. WhatsApp docs to {{property_price}} or email {{property_list_detailed}}. - Bharat Properties',
        tags: ['Documentation', 'Reminder']
    },
    {
        id: 5,
        name: 'Payment Due',
        body: 'Hi {{first_name}}, Payment reminder for {{property_category}}: Rs{{property_location}} due on {{property_size}}. Pay via {{property_price}}. Confirm at {{property_list_detailed}}. Thank you! - Bharat Properties',
        tags: ['Payment', 'Reminder']
    },
    {
        id: 6,
        name: 'Price Drop Alert',
        body: 'PRICE DROP! {{first_name}} in {{property_category}} now Rs{{property_location}} (was Rs{{property_size}}). Save Rs{{property_price}}! Limited time. Call {{property_list_detailed}} NOW - {{agent_mobile}}, Bharat Properties',
        tags: ['Price Drop', 'Urgent']
    },
    {
        id: 7,
        name: 'Welcome SMS',
        body: 'Welcome {{first_name}}! I am {{property_category}}, your property consultant at Bharat Properties. Looking for {{property_location}}? Call/WhatsApp {{property_size}} anytime. Lets find your dream home!',
        tags: ['Welcome', 'Onboarding']
    },
    {
        id: 8,
        name: 'Deal Closure',
        body: 'Congratulations {{first_name}}! Your {{property_category}} booking in {{property_location}} is confirmed. Booking ID: {{property_size}}. Next steps: {{property_price}}. Contact {{property_list_detailed}} - Bharat Properties',
        tags: ['Closure', 'Confirmation']
    },
    {
        id: 9,
        name: 'Exclusive Offer',
        body: 'EXCLUSIVE for you {{first_name}}! {{property_category}} in {{property_location}} - {{property_size}} match! Rs{{property_price}}, {{property_list_detailed}}. Book visit: {{agent_mobile}}. Offer ends {{due_date}} - Bharat Properties',
        tags: ['Offer', 'Exclusive']
    },
    {
        id: 10,
        name: 'Deal Property Match',
        body: 'EXCLUSIVE MATCH 🌟 Hi {{first_name}}, we found a highly sought-after {{property_size}} unit at {{project_name}}, {{property_location}} matching your exact criteria! 🔑 Premium inventory, moving fast at {{property_price}}. Reply YES or call us ASAP to secure a priority viewing! - Bharat Properties',
        tags: ['Deal Match', 'Priority'], systemContext: ['deal_match', 'deal_match_modal']
    },
    {
        id: 'fb_interested_hot_sms',
        name: 'Feedback: Interested (Hot)',
        body: "{unit} Update: Hi {{full_name}}, finalized meeting for {{due_date}}. Please keep documents ready.",
        tags: ['Feedback', 'Inventory']
    },
    {
        id: 'fb_interested_warm_sms',
        name: 'Feedback: Interested (Warm)',
        body: "Hi {owner}, thanks for discussing {{unit_number}}. Noted your interest as {{lead_status}}. Will share details soon.",
        tags: ['Feedback', 'Inventory']
    },
    {
        id: 'fb_callback_sms',
        name: 'Feedback: Request Call Back',
        body: "Hi {owner}, will call you back at {{due_date}} regarding {{unit_number}}. Sorry for the interruption.",
        tags: ['Feedback', 'Inventory']
    },
    {
        id: 'fb_not_interested_sms',
        name: 'Feedback: Not Interested',
        body: "Hi {owner}, noted on {{unit_number}} as {{lead_status}}. Reach out if plans change. Thanks.",
        tags: ['Feedback', 'Inventory']
    },
    {
        id: 'fb_busy_driving_sms',
        name: 'Feedback: Busy / Driving',
        body: "Hi {owner}, tried calling for {{unit_number}}. Will call again later. Thanks — Bharat Properties",
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
        body: "Hi {owner}, thanks for feedback on {{unit_number}}. Contact us if you decide to sell/rent. Active buyers ready — Bharat Properties",
        tags: ['Feedback', 'Inventory']
    },
    {
        id: 'fb_general_inquiry_sms',
        name: 'Feedback: General Inquiry',
        body: "Hi {owner}, noted your inquiry on {{unit_number}}. Our team will connect shortly. - Bharat Properties",
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
        body: 'Discover Your Dream Home 🏠\n\n{{first_name}} in {{property_category}}\n\nSize: {{property_location}}\nPrice: ₹{{property_size}}\nHighlights: {{property_price}}\n\nExclusive viewing slots available!',
        media: { type: 'image', url: 'property_image_url' },
        buttons: [
            { type: 'URL', text: 'View Details', url: '{{property_list_detailed}}' },
            { type: 'PHONE', text: 'Call Agent', phone: '{{agent_mobile}}' },
            { type: 'REPLY', text: 'Book Visit', reply: 'BOOK_VISIT' }
        ],
        tags: ['Property', 'Premium']
    },
    {
        id: 2,
        name: 'New Project Launch',
        body: '🚀 NEW LAUNCH: {{first_name}}\n\n{{property_category}}\n\n✨ Features:\n{{property_location}}\n\n💎 Early Bird Offer:\n{{property_size}}\n\nLimited units available!',
        media: { type: 'image', url: 'project_banner_url' },
        buttons: [
            { type: 'URL', text: 'View Brochure', url: '{{property_price}}' },
            { type: 'PHONE', text: 'Call Now', phone: '{{property_list_detailed}}' },
            { type: 'REPLY', text: 'Get Price List', reply: 'PRICE_LIST' }
        ],
        tags: ['Launch', 'Marketing']
    },
    {
        id: 3,
        name: 'Site Visit Invitation',
        body: 'Your Property Viewing Awaits! 🗓️\n\n{{first_name}} in {{property_category}}\n\nAvailable Slots:\n• {{property_location}}\n• {{property_size}}\n• {{property_price}}\n\nAgent {{property_list_detailed}} will accompany you.',
        media: { type: 'image', url: 'property_exterior_url' },
        buttons: [
            { type: 'REPLY', text: 'Slot 1', reply: 'SLOT_1' },
            { type: 'REPLY', text: 'Slot 2', reply: 'SLOT_2' },
            { type: 'REPLY', text: 'Slot 3', reply: 'SLOT_3' },
            { type: 'PHONE', text: 'Call Agent', phone: '{{agent_mobile}}' }
        ],
        tags: ['Site Visit', 'Interactive']
    },
    {
        id: 4,
        name: 'Virtual Tour Invitation',
        body: 'Experience {{first_name}} from Home! 🎥\n\n360° Virtual Tour Available\n\nLocation: {{property_category}}\nSize: {{property_location}}\nPrice: ₹{{property_size}}\n\nTake a virtual walk-through now!',
        media: { type: 'video', url: 'virtual_tour_url' },
        buttons: [
            { type: 'URL', text: 'Start Virtual Tour', url: '{{property_price}}' },
            { type: 'REPLY', text: 'Book Physical Visit', reply: 'PHYSICAL_VISIT' },
            { type: 'PHONE', text: 'Speak to Agent', phone: '{{property_list_detailed}}' }
        ],
        tags: ['Virtual Tour', 'Technology']
    },
    {
        id: 5,
        name: 'Document Submission',
        body: 'Document Checklist 📄\n\nFor {{first_name}} booking:\n\n{{property_category}}\n\nDeadline: {{property_location}}\n\nSubmit via WhatsApp or upload online.',
        media: { type: 'image', url: 'document_checklist_url' },
        buttons: [
            { type: 'URL', text: 'Upload Documents', url: '{{property_size}}' },
            { type: 'PHONE', text: 'WhatsApp Docs', phone: '{{property_price}}' },
            { type: 'REPLY', text: 'Need Help', reply: 'HELP_DOCS' }
        ],
        tags: ['Documentation', 'Transaction']
    },
    {
        id: 6,
        name: 'Payment Reminder Rich',
        body: 'Payment Reminder 💰\n\n{{first_name}}\n\nAmount: ₹{{property_category}}\nDue: {{property_location}}\nType: {{property_size}}\n\nPay securely online or via bank transfer.',
        media: { type: 'image', url: 'payment_reminder_banner' },
        buttons: [
            { type: 'URL', text: 'Pay Online', url: '{{property_price}}' },
            { type: 'REPLY', text: 'Payment Done', reply: 'PAID' },
            { type: 'PHONE', text: 'Call Support', phone: '{{property_list_detailed}}' }
        ],
        tags: ['Payment', 'Reminder']
    },
    {
        id: 7,
        name: 'Exclusive Deal Alert',
        body: '🔥 EXCLUSIVE MATCH!\n\n{{first_name}}, we found your perfect property!\n\n{{property_category}} in {{property_location}}\nMatch Score: {{property_size}}%\n\nPrice: ₹{{property_price}}\n\n⚡ High demand - Act fast!',
        media: { type: 'image', url: 'property_highlight_url' },
        buttons: [
            { type: 'URL', text: 'Full Details', url: '{{property_list_detailed}}' },
            { type: 'REPLY', text: 'Book Visit Today', reply: 'BOOK_NOW' },
            { type: 'REPLY', text: 'See Similar', reply: 'SIMILAR' },
            { type: 'PHONE', text: 'Call {{agent_mobile}}', phone: '{{agent_mobile}}' }
        ],
        tags: ['Deal', 'Urgent', 'Personalized']
    },
    {
        id: 8,
        name: 'Customer Testimonial',
        body: '⭐ Success Story\n\n"{{first_name}}"\n\n- {{property_category}}\n{{property_location}}\n\nJoin {{property_size}}+ happy homeowners!\n\nLet us help you find your dream property.',
        media: { type: 'image', url: 'testimonial_image_url' },
        buttons: [
            { type: 'URL', text: 'View All Reviews', url: '{{property_price}}' },
            { type: 'REPLY', text: 'Start My Journey', reply: 'START' },
            { type: 'PHONE', text: 'Talk to Expert', phone: '{{property_list_detailed}}' }
        ],
        tags: ['Testimonial', 'Trust Building']
    },
    {
        id: 9,
        name: 'Price Comparison',
        body: 'Smart Investment Alert 📊\n\n{{first_name}} in {{property_category}}\n\nOur Price: ₹{{property_location}}\nMarket Avg: ₹{{property_size}}\nYou Save: ₹{{property_price}}\n\nROI Potential: {{property_list_detailed}}%',
        media: { type: 'image', url: 'price_comparison_chart' },
        buttons: [
            { type: 'URL', text: 'Detailed Analysis', url: '{{agent_mobile}}' },
            { type: 'REPLY', text: 'Book Now', reply: 'BOOK' },
            { type: 'PHONE', text: 'Discuss Investment', phone: '{{due_date}}' }
        ],
        tags: ['Investment', 'Analytics']
    },
    {
        id: 10,
        name: 'Feedback Request',
        body: 'We Value Your Feedback! 🌟\n\nHi {{first_name}},\n\nHow was your experience with Bharat Properties?\n\nYour feedback helps us serve you better.',
        media: { type: 'image', url: 'feedback_banner_url' },
        buttons: [
            { type: 'URL', text: 'Share Feedback', url: '{{property_category}}' },
            { type: 'REPLY', text: 'Excellent ⭐⭐⭐⭐⭐', reply: 'RATING_5' },
            { type: 'REPLY', text: 'Good ⭐⭐⭐⭐', reply: 'RATING_4' },
            { type: 'PHONE', text: 'Call Us', phone: '{{property_location}}' }
        ],
        tags: ['Feedback', 'Relationship']
    }
, 
    {
        id: 'tpl_deal_match_rcs',
        name: 'Deal Property Match',
        systemContext: ['deal_match', 'deal_match_modal'],
        body: 'Property Match Found 🏠\n\nDear {{first_name}},\n\nWe found a unit in {{project_name}} matching your requirements.\n\nLocation: {{property_location}}\nPrice: {{property_price}}\n\nPlease review and let us know your thoughts.',
        media: { type: 'image', url: 'property_exterior_url' },
        buttons: [
            { type: 'URL', text: 'View Details', url: '{{property_list_detailed}}' },
            { type: 'REPLY', text: 'Interested', reply: 'INTERESTED' },
            { type: 'PHONE', text: 'Call Agent', phone: '{{agent_mobile}}' }
        ],
        tags: ['Deal Match', 'Priority']
    }
];