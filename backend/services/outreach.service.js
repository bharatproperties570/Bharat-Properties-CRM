import EmailService from './email.service.js';
import Notification from '../models/Notification.js';
import { getExactMatchLeadsForDeal } from '../controllers/lead.controller.js';

export const triggerDealMatchEmailOutreach = async (deal, reqUser) => {
    try {
        console.log(`[OUTREACH] Starting automated email outreach for Deal: ${deal._id}`);
        
        // Find preferred matching leads
        const preferredLeads = await getExactMatchLeadsForDeal(deal);
        if (!preferredLeads || preferredLeads.length === 0) {
            console.log(`[OUTREACH] No preferred matches found for Deal ${deal._id}. Aborting email outreach.`);
            return;
        }

        console.log(`[OUTREACH] Found ${preferredLeads.length} preferred matches. Preparing emails.`);

        // Deal details for template
        const projectName = deal.projectName || deal.inventoryId?.projectName || 'Exclusive Property';
        const dealLocation = deal.location || deal.inventoryId?.address?.locality || deal.sector || 'Prime Location';
        const dealPrice = deal.price || deal.quotePrice ? `₹${(deal.price || deal.quotePrice).toLocaleString('en-IN')}` : 'Price on Request';
        const dealUnitNo = deal.unitNo || 'Premium Unit';
        const dealSizeLabel = deal.sizeLabel?.lookup_value || deal.sizeLabel || 'Spacious Unit';
        const dealOwnership = deal.ownershipType?.lookup_value || deal.ownershipType || 'Freehold';
        const dealStage = deal.stage || 'Available';
        const dealSubCat = deal.subCategory?.lookup_value || deal.subCategory || 'Property';
        const dealIntent = deal.intent?.lookup_value || deal.intent || 'Sale';

        // Format sender info
        const senderName = reqUser ? `${reqUser.firstName || ''} ${reqUser.lastName || ''}`.trim() : 'Bharat Properties';
        const senderRole = reqUser?.designation || 'Senior Consultant';
        const senderPhone = reqUser?.mobile || '+91-XXXXX-XXXXX';
        const senderEmail = reqUser?.email || 'sales@bharatproperties.in';
        
        const signatureHTML = `
            <strong>${senderName}</strong><br>
            <span style="color: #64748b; font-size: 13px;">${senderRole} | Bharat Properties</span><br>
            <span style="color: #64748b; font-size: 13px;">📱 ${senderPhone} | ✉️ ${senderEmail}</span>
        `;

        let emailsSent = 0;

        for (const lead of preferredLeads) {
            if (!lead.email) {
                console.log(`[OUTREACH] Lead ${lead._id} has no email address. Skipping.`);
                continue;
            }

            const firstName = lead.firstName || 'Client';

            const subject = `🏠 Exclusive Property Match Found for You | ${projectName}`;

            // Simplified yet professional template matching the frontend structure
            const htmlContent = `
<div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 640px; margin: 0 auto; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden;">
  <!-- Header Banner -->
  <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 60%, #0ea5e9 100%); padding: 36px 40px 32px; text-align: center;">
    <div style="display: inline-block; background: rgba(255,255,255,0.15); border-radius: 50px; padding: 6px 20px; margin-bottom: 16px;">
      <span style="color: #bfdbfe; font-size: 12px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase;">⭐ Exclusive Property Match</span>
    </div>
    <h1 style="margin: 0 0 8px; color: #ffffff; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">We Found Your Perfect Match!</h1>
    <p style="margin: 0; color: #bfdbfe; font-size: 15px; font-weight: 500;">Based on your requirements, here is a curated property that fits you perfectly.</p>
  </div>

  <!-- Greeting -->
  <div style="background: #ffffff; padding: 32px 40px 0;">
    <p style="margin: 0 0 6px; font-size: 15px; color: #475569;">Dear <strong style="color: #1e293b;">${firstName}</strong>,</p>
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
            <div style="font-size: 22px; font-weight: 900; color: #0c4a6e; margin: 0; word-break: break-word;">${projectName}</div>
            <div style="font-size: 13px; color: #0369a1; margin-top: 4px; font-weight: 600;">${dealLocation}</div>
          </td>
          <td valign="top" style="text-align: right;">
            <div style="font-size: 11px; font-weight: 700; color: #059669; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;">💰 Asking Price</div>
            <div style="font-size: 24px; font-weight: 900; color: #065f46;">${dealPrice}</div>
            <div style="font-size: 11px; color: #6b7280; margin-top: 3px; font-weight: 600;">All Inclusive</div>
          </td>
        </tr>
      </table>
    </div>

    <!-- Details -->
    <div style="margin-bottom: 20px; font-size: 14px; color: #334155; line-height: 1.6;">
        <ul style="list-style-type: none; padding: 0; margin: 0;">
            <li style="margin-bottom: 8px;"><strong>🏷️ Intent:</strong> ${dealIntent}</li>
            <li style="margin-bottom: 8px;"><strong>🏡 Type:</strong> ${dealSubCat}</li>
            <li style="margin-bottom: 8px;"><strong>🏗️ Unit No:</strong> ${dealUnitNo}</li>
            <li style="margin-bottom: 8px;"><strong>📏 Size:</strong> ${dealSizeLabel}</li>
            <li style="margin-bottom: 8px;"><strong>📜 Ownership:</strong> ${dealOwnership}</li>
            <li style="margin-bottom: 8px;"><strong>📊 Status:</strong> ${dealStage}</li>
        </ul>
    </div>

    <!-- Call to Action -->
    <div style="text-align: center; margin-bottom: 10px;">
      <a href="mailto:${senderEmail}?subject=Interest%20in%20${encodeURIComponent(projectName)}%20(Unit%20${encodeURIComponent(dealUnitNo)})&body=Hi%20${encodeURIComponent(senderName)},%0A%0AI%20am%20interested%20in%20the%20property%20${encodeURIComponent(projectName)}.%20Please%20share%20more%20details." style="display: inline-block; background: #2563eb; color: #ffffff; font-weight: 700; font-size: 16px; text-decoration: none; padding: 14px 28px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2);">Schedule a Viewing</a>
    </div>
  </div>

  <!-- Footer -->
  <div style="background: #f1f5f9; padding: 32px 40px; border-top: 1px solid #e2e8f0;">
    <p style="margin: 0 0 16px; font-size: 14px; color: #475569; line-height: 1.6;">
      Please let me know if you would like to schedule a site visit or if you need the detailed layout plans and cost sheets.
    </p>
    <p style="margin: 0; font-size: 14px; color: #1e293b; line-height: 1.6;">
      Best regards,<br><br>
      ${signatureHTML}
    </p>
  </div>
</div>
            `;

            try {
                await EmailService.sendEmail(
                    lead.email,
                    subject,
                    `Hi ${firstName}, we found a highly sought-after unit at ${projectName}, matching your exact criteria!`,
                    htmlContent
                );
                emailsSent++;
                console.log(`[OUTREACH] Sent match email to ${lead.email}`);
            } catch (err) {
                console.error(`[OUTREACH] Failed to send email to ${lead.email}:`, err.message);
            }
        }

        // Create System Notification for User
        if (reqUser && emailsSent > 0) {
            await Notification.create({
                user: reqUser._id,
                type: 'system',
                title: '🎯 Automated Outreach Completed',
                message: `Successfully sent Deal Property Match emails to ${emailsSent} preferred matching leads for ${projectName}.`,
                link: `/deals/${deal._id}`,
                priority: 'medium',
                isRead: false
            });
            console.log(`[OUTREACH] Notification created for user ${reqUser._id}.`);
        } else if (reqUser && emailsSent === 0) {
            await Notification.create({
                user: reqUser._id,
                type: 'system',
                title: '🎯 Automated Outreach Update',
                message: `No emails were sent for ${projectName}. Preferred leads either lacked email addresses or no matches were found.`,
                link: `/deals/${deal._id}`,
                priority: 'low',
                isRead: false
            });
        }

    } catch (error) {
        console.error("[OUTREACH] Fatal error in triggerDealMatchEmailOutreach:", error);
    }
};
