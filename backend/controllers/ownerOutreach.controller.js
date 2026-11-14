import WhatsAppIntegration from '../models/WhatsAppIntegration.js';
import WhatsAppAccountAuthorizationService from '../services/WhatsAppAccountAuthorizationService.js';
import OwnerOutreachService from '../services/OwnerOutreachService.js';

const service = new OwnerOutreachService();

export const previewOwnerOutreachAudience = async (req, res) => {
    try {
        const result = await service.preview(req.body || {}, req.user);
        return res.json({ success: true, data: result });
    } catch (error) {
        return res.status(400).json({ success: false, error: error.message });
    }
};

export const createOwnerOutreachDraft = async (req, res) => {
    try {
        const result = await service.createDraft(req.body || {}, req.user);
        return res.status(201).json({ success: true, data: result });
    } catch (error) {
        return res.status(400).json({ success: false, error: error.message });
    }
};

export const listOwnerOutreachCampaigns = async (req, res) => {
    try {
        const data = await service.listCampaigns(req.user, req.query.limit);
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(500).json({ success: false, error: 'Unable to load owner outreach campaigns' });
    }
};

export const getOwnerOutreachCampaign = async (req, res) => {
    try {
        const data = await service.getCampaign(req.user, req.params.id);
        if (!data) return res.status(404).json({ success: false, error: 'Campaign not found' });
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(500).json({ success: false, error: 'Unable to load owner outreach campaign' });
    }
};

export const approveOwnerOutreachCampaign = async (req, res) => {
    try {
        const data = await service.approveCampaign(req.user, req.params.id);
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(400).json({ success: false, error: error.message });
    }
};

export const pauseOwnerOutreachCampaign = async (req, res) => {
    try {
        const data = await service.pauseCampaign(req.user, req.params.id);
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(409).json({ success: false, error: error.message });
    }
};

export const resumeOwnerOutreachCampaign = async (req, res) => {
    try {
        const data = await service.resumeCampaign(req.user, req.params.id);
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(409).json({ success: false, error: error.message });
    }
};

export const cancelOwnerOutreachCampaign = async (req, res) => {
    try {
        const data = await service.cancelCampaign(req.user, req.params.id, req.body?.reason);
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(409).json({ success: false, error: error.message });
    }
};

export const listOwnerOutreachWhatsAppAccounts = async (req, res) => {
    try {
        const integrations = await WhatsAppIntegration.find({ status: 'ACTIVE' })
            .select('_id provider connectionType onboardingStatus subscriptionStatus webhookStatus displayPhoneNumber accountLabel connectedBy allowedUsers allowedRoles allowedDepartments isDefault')
            .lean();
        const authorized = WhatsAppAccountAuthorizationService.filterAuthorizedAccounts(req.user, integrations);
        const ready = authorized.filter((account) => {
            if (account.provider === 'BAILEYS') return account.connectionType === 'QR_SCANNER' && account.onboardingStatus === 'QR_LINKED';
            if (account.provider === 'META') return ['NEW_API', 'COEXISTENCE'].includes(account.connectionType) &&
                account.onboardingStatus === 'CONNECTED' && account.subscriptionStatus === 'SUBSCRIBED' &&
                ['SUBSCRIBED', 'VERIFIED'].includes(account.webhookStatus);
            return false;
        }).map(({ _id, provider, connectionType, displayPhoneNumber, accountLabel, isDefault }) => ({
            id: String(_id), provider, connectionType,
            label: accountLabel || displayPhoneNumber || provider,
            displayPhoneNumber: displayPhoneNumber || '',
            isDefault: Boolean(isDefault)
        }));
        return res.json({ success: true, data: ready });
    } catch (error) {
        return res.status(500).json({ success: false, error: 'Unable to load authorized WhatsApp accounts' });
    }
};
