import axios from 'axios';
const token = 'EAAQYCQScYfgBR6GYNyheiKkbbmakDxVifCBJDIXWdQi0d5XH1DF2wUDO0Lp3bdlZAtlvymc3U2Nznf8VAGadxByrh51B2lGxvoGF9aZCz80PEXZCuhAPVMYxGELgLyjyYkzZCLcxWlBYZARAuyDnggfdB4udbb9yiY8CtCRji9V4TP6LYREMZBZAJ974b8uvZBQRKwZDZD';
const businessId = '1473077001025314';
async function run() {
    try {
        const url = `https://graph.facebook.com/v19.0/${businessId}/message_templates`;
        const res = await axios.get(url, { headers: { 'Authorization': `Bearer ${token}` }});
        const wl = res.data.data.find(t => t.name === 'welcome_lead');
        console.log(JSON.stringify(wl, null, 2));
    } catch(e) {
        console.error(e.response ? e.response.data : e.message);
    }
}
run();
