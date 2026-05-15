import DiscoveryConfig from '../../../models/DiscoveryConfig.js';
import googleDiscoveryService from '../../../services/discovery/GoogleDiscoveryService.js';

export const getConfigs = async (req, res) => {
    try {
        const configs = await DiscoveryConfig.find().sort('-createdAt');
        res.status(200).json({ success: true, data: configs });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const createConfig = async (req, res) => {
    try {
        const config = new DiscoveryConfig(req.body);
        await config.save();
        
        if (config.is_active) {
            googleDiscoveryService.scheduleJob(config);
        }
        
        res.status(201).json({ success: true, data: config });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const updateConfig = async (req, res) => {
    try {
        const config = await DiscoveryConfig.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!config) return res.status(404).json({ success: false, message: 'Config not found' });

        if (config.is_active) {
            googleDiscoveryService.scheduleJob(config);
        } else {
            googleDiscoveryService.stopJob(config._id);
        }

        res.status(200).json({ success: true, data: config });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const deleteConfig = async (req, res) => {
    try {
        const config = await DiscoveryConfig.findByIdAndDelete(req.params.id);
        if (!config) return res.status(404).json({ success: false, message: 'Config not found' });
        
        googleDiscoveryService.stopJob(config._id);
        
        res.status(200).json({ success: true, message: 'Config deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const triggerConfig = async (req, res) => {
    try {
        const { id } = req.params;
        // Fire asynchronously so we don't block the HTTP request
        googleDiscoveryService.runDiscovery(id);
        res.status(200).json({ success: true, message: 'Discovery job triggered successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
