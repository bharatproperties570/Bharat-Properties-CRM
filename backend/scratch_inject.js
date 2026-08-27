import fs from 'fs';
const path = 'routes/lead.routes.js';
let content = fs.readFileSync(path, 'utf8');
const inject = `
router.get('/test-trigger-delay', async (req, res) => {
    try {
        const { WorkflowEngine } = await import('../src/utils/WorkflowEngine.js');
        const Lead = (await import('../models/Lead.js')).default;
        const Trigger = (await import('../models/Trigger.js')).default;
        const lead = await Lead.findOne().sort({createdAt: -1}).populate('status').lean();
        console.log('--- TEST TRIGGER DELAY ROUTE CALLED ---');
        await WorkflowEngine.fireEvent('leads', 'lead_created', lead, lead.companyId);
        res.json({success: true});
    } catch(e) { res.status(500).json({error: e.message}); }
});
`;
if (!content.includes('/test-trigger-delay')) {
    content = content.replace('const router = express.Router();', 'const router = express.Router();' + inject);
    fs.writeFileSync(path, content);
    console.log('Injected');
} else {
    console.log('Already injected');
}
