import fs from 'fs';
const file = '/home/ubuntu/bharat-properties-crm/backend/controllers/activity.controller.js';
let content = fs.readFileSync(file, 'utf8');

const injection = `
        // ✨ ENTERPRISE: Instant Status Sync
        try {
            const leadForStatus = await Lead.findById(leadId).populate('status', 'lookup_value').lean();
            if (leadForStatus) {
                const currentStatus = (leadForStatus.status?.lookup_value || '').toLowerCase();
                // Wake up stale leads or initialize new leads
                if (!currentStatus || currentStatus === 'new' || currentStatus === 'stalled' || currentStatus === 'dormant' || currentStatus === 'at risk') {
                    let targetStatus = 'Working';
                    if (currentStatus === 'new' || !currentStatus) {
                        targetStatus = 'Contacted'; // First touch
                    }
                    
                    const statusLookup = await (await import('../models/Lookup.js')).default.findOne({ lookup_type: 'Status', lookup_value: { $regex: new RegExp(\`^\${targetStatus}$\`, 'i') } }).lean();
                    if (statusLookup) {
                        await Lead.findByIdAndUpdate(leadId, { status: statusLookup._id });
                        console.log(\`[StatusSync] Lead \${leadId} status auto-updated from '\${currentStatus || 'None'}' to '\${targetStatus}'\`);
                        transition.statusChanged = true;
                        transition.newStatus = targetStatus;
                    }
                }
            }
        } catch(e) {
            console.error('[StatusSync] Error syncing status:', e.message);
        }

        if (transition && transition.stageChanged) {`;

content = content.replace('        if (transition.stageChanged) {', injection);
fs.writeFileSync(file, content, 'utf8');
console.log('Patched activity.controller.js successfully');
