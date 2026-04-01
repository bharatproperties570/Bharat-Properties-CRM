/**
 * CampaignConfig.js
 * Central configuration for the Deal-Triggered Campaign Engine.
 * Controls which channels fire, their templates, and timing delays.
 */

export const CAMPAIGN_CHANNELS = {
    WHATSAPP:   { enabled: true,  label: 'WhatsApp Broadcast',    icon: '💬', delayMs: 0 },
    EMAIL:      { enabled: true,  label: 'Email Campaign',        icon: '📧', delayMs: 0 },
    SMS:        { enabled: true,  label: 'SMS Blast',             icon: '📲', delayMs: 2000 },
    RCS:        { enabled: false, label: 'RCS Rich Card',         icon: '✨', delayMs: 3000 }, // Requires RCS API provider
    SOCIAL:     { enabled: false, label: 'Social Auto-post',      icon: '📱', delayMs: 5000 }, // Requires Meta/GMB tokens
};

/**
 * Build a WhatsApp message template from a Deal's property data.
 * @param {Object} deal   - Populated Deal document
 * @param {Object} inv    - Populated Inventory document (optional)
 */
export const buildWhatsAppTemplate = (deal, inv) => {
    const project = inv?.projectName || deal?.projectName || 'Our New Listing';
    const price = inv?.price?.value
        ? `₹${Number(inv.price.value).toLocaleString('en-IN')}`
        : 'Special Price';
    const city = inv?.address?.city?.lookup_value || inv?.city || '';
    const link = `${process.env.FRONTEND_URL || 'https://crm.bharatproperties.co'}/deals/${deal._id}`;

    return {
        message: `🏢 *${project}* ${city ? `— ${city}` : ''}\n\n💰 At just *${price}*\n\n🔑 Don't miss this opportunity! Book your site visit today.\n👉 ${link}\n\n_Bharat Properties Team_`,
    };
};

/**
 * Build an Email campaign from a Deal's property data.
 */
export const buildEmailTemplate = (deal, inv) => {
    const project = inv?.projectName || deal?.projectName || 'New Property Opportunity';
    const price = inv?.price?.value
        ? `₹${Number(inv.price.value).toLocaleString('en-IN')}`
        : 'Special Price';
    const size = inv?.size?.value ? `${inv.size.value} ${inv.size.unit || 'Sq.Ft.'}` : '';
    const city = inv?.address?.city?.lookup_value || inv?.city || '';

    const subject = `🏢 Exclusive: ${project}${city ? ' in ' + city : ''} — ${price}`;

    const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc; padding: 20px; border-radius: 12px;">
      <div style="background: linear-gradient(135deg, #1273eb, #0949ad); padding: 24px; border-radius: 8px; text-align: center; color: white;">
        <h1 style="margin: 0; font-size: 22px;">🏢 ${project}</h1>
        ${city ? `<p style="margin: 6px 0 0; opacity: 0.9;">${city}</p>` : ''}
      </div>
      <div style="background: white; padding: 24px; border-radius: 8px; margin-top: 12px;">
        <h2 style="color: #1e293b; font-size: 28px; margin: 0 0 8px;">${price}</h2>
        ${size ? `<p style="color: #64748b; margin: 0 0 16px;">📐 ${size}</p>` : ''}
        <p style="color: #334155; line-height: 1.6;">
          We're excited to present you with an exclusive property opportunity from Bharat Properties.
          This is a limited-time offer — act fast to secure your booking!
        </p>
        <a href="${process.env.FRONTEND_URL || 'https://crm.bharatproperties.co'}/deals/${deal._id}"
           style="display: inline-block; background: #1273eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 16px;">
           📅 Book a Site Visit
        </a>
      </div>
      <p style="color: #94a3b8; font-size: 12px; text-align: center; margin-top: 16px;">
        Bharat Properties · Real Estate Experts
      </p>
    </div>`;

    return { subject, html, text: `${project} — ${price}. Book a site visit: ${process.env.FRONTEND_URL}/deals/${deal._id}` };
};

/**
 * Build an SMS message (max 160 chars, DLT-compliant format).
 */
export const buildSmsTemplate = (deal, inv) => {
    const project = (inv?.projectName || deal?.projectName || 'New Property').substring(0, 30);
    const price = inv?.price?.value
        ? `Rs.${Math.round(inv.price.value / 100000)}L`
        : 'Special Price';
    return {
        message: `New Property Alert! ${project} @ ${price}. Book visit: bhrtprop.co/${deal._id.toString().slice(-6)} -BHARATPROPERTIES`,
    };
};
