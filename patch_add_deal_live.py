import re

file_path = "/Users/bharatproperties/.gemini/antigravity/scratch/bharat-properties-crm/src/components/AddDealModal.jsx"

with open(file_path, "r") as f:
    content = f.read()

# 1. Update sendMatchedDeal initialization
search_init = """        // Send Matched Deal
        sendMatchedDeal: {
            sms: false,
            whatsapp: false,
            email: false,
            rcs: false
        },"""

replace_init = """        // Send Matched Deal
        sendMatchedDeal: {
            sms: false,
            whatsapp: false,
            whatsapp_app: false,
            email: false,
            rcs: false
        },"""

content = content.replace(search_init, replace_init)

# 2. Add state and useEffect for live matching
search_state = """    const [isSaving, setIsSaving] = useState(false);"""
replace_state = """    const [isSaving, setIsSaving] = useState(false);

    // Live Match Preview State
    const [liveMatchCount, setLiveMatchCount] = useState(null);
    const [isLiveMatching, setIsLiveMatching] = useState(false);
    const [liveMatchedLeads, setLiveMatchedLeads] = useState([]);

    useEffect(() => {
        const fetchMatches = async () => {
            if (!formData.projectName && !formData.price && !formData.location) {
                setLiveMatchCount(null);
                setLiveMatchedLeads([]);
                return;
            }
            setIsLiveMatching(true);
            try {
                // We use POST to send the draft deal data
                const matchRes = await api.post('leads/match', { deal: formData });
                if (matchRes.data?.success) {
                    setLiveMatchCount(matchRes.data.count || 0);
                    setLiveMatchedLeads(matchRes.data.matchingLeads || []);
                } else {
                    setLiveMatchCount(0);
                    setLiveMatchedLeads([]);
                }
            } catch(e) {
                setLiveMatchCount(0);
                setLiveMatchedLeads([]);
            } finally {
                setIsLiveMatching(false);
            }
        };
        const timer = setTimeout(fetchMatches, 800);
        return () => clearTimeout(timer);
    }, [formData.projectName, formData.price, formData.location, formData.category, formData.subCategory, formData.propertyType, formData.size]);"""

if "const [liveMatchCount" not in content:
    content = content.replace(search_state, replace_state)


# 3. Update AI Lead Matching UI
search_ui = """                                    <div>
                                        <h5 style={{ margin: '0 0 4px 0', fontSize: '0.9rem', fontWeight: 700, color: '#334155' }}>🎯 AI Lead Matching & Outreach</h5>
                                        <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>Automatically notify matching leads via selected channels upon deal creation.</p>
                                    </div>"""

replace_ui = """                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <h5 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#334155' }}>🎯 AI Lead Matching & Outreach</h5>
                                            {isLiveMatching ? (
                                                <span style={{ fontSize: '0.7rem', color: '#64748b', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}><i className="fas fa-spinner fa-spin"></i> Calculating...</span>
                                            ) : liveMatchCount !== null && (
                                                <span style={{ 
                                                    fontSize: '0.7rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px',
                                                    color: liveMatchCount > 0 ? '#059669' : '#ef4444',
                                                    background: liveMatchCount > 0 ? '#d1fae5' : '#fee2e2'
                                                }}>
                                                    {liveMatchCount} {liveMatchCount === 1 ? 'Match' : 'Matches'}
                                                </span>
                                            )}
                                        </div>
                                        <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>Automatically notify matching leads via selected channels upon deal creation.</p>
                                    </div>"""

content = content.replace(search_ui, replace_ui)

# Add whatsapp_app to the buttons and handle disabled state
search_buttons = """                                    {[
                                        { id: 'sms', icon: 'fas fa-comment-dots', label: 'SMS', color: '#6366f1' },
                                        { id: 'whatsapp', icon: 'fab fa-whatsapp', label: 'WhatsApp', color: '#25d366' },
                                        { id: 'email', icon: 'fas fa-envelope', label: 'Email', color: '#ef4444' },
                                        { id: 'rcs', icon: 'fas fa-comment-alt', label: 'RCS', color: '#3b82f6' }
                                    ].map(option => ("""

replace_buttons = """                                    {[
                                        { id: 'sms', icon: 'fas fa-comment-dots', label: 'SMS', color: '#6366f1' },
                                        { id: 'whatsapp', icon: 'fab fa-whatsapp', label: 'WhatsApp (API)', color: '#25d366' },
                                        { id: 'whatsapp_app', icon: 'fas fa-comment', label: 'WA App (Native)', color: '#059669' },
                                        { id: 'email', icon: 'fas fa-envelope', label: 'Email', color: '#ef4444' },
                                        { id: 'rcs', icon: 'fas fa-comment-alt', label: 'RCS', color: '#3b82f6' }
                                    ].map(option => {
                                        const isDisabled = liveMatchCount === 0;
                                        return ("""

search_button_end = """                                        </button>
                                    ))}"""
replace_button_end = """                                        </button>
                                    );})}"""

content = content.replace(search_buttons, replace_buttons)
content = content.replace(search_button_end, replace_button_end)

# Disable the button itself
search_btn_click = """                                            onClick={() => handleNestedInputChange('sendMatchedDeal', option.id, !formData.sendMatchedDeal[option.id])}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '10px', padding: '12px',
                                                borderRadius: '10px', border: `2px solid ${formData.sendMatchedDeal[option.id] ? option.color : '#e2e8f0'}`,
                                                background: formData.sendMatchedDeal[option.id] ? `${option.color}10` : '#fff',
                                                cursor: 'pointer', transition: 'all 0.2s',
                                                color: formData.sendMatchedDeal[option.id] ? option.color : '#64748b'
                                            }}"""

replace_btn_click = """                                            onClick={() => !isDisabled && handleNestedInputChange('sendMatchedDeal', option.id, !formData.sendMatchedDeal[option.id])}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '10px', padding: '12px',
                                                borderRadius: '10px', border: `2px solid ${formData.sendMatchedDeal[option.id] ? option.color : '#e2e8f0'}`,
                                                background: formData.sendMatchedDeal[option.id] ? `${option.color}10` : '#fff',
                                                cursor: isDisabled ? 'not-allowed' : 'pointer', transition: 'all 0.2s',
                                                color: formData.sendMatchedDeal[option.id] ? option.color : '#64748b',
                                                opacity: isDisabled ? 0.5 : 1
                                            }}"""

content = content.replace(search_btn_click, replace_btn_click)

# In the schedule UI array, add whatsapp_app
search_sched_map = """{['whatsapp', 'email', 'sms', 'rcs'].map(ch => {"""
replace_sched_map = """{['whatsapp', 'whatsapp_app', 'email', 'sms', 'rcs'].map(ch => {"""
content = content.replace(search_sched_map, replace_sched_map)

search_sched_labels = """const labels = { whatsapp: 'WhatsApp', email: 'Email', sms: 'SMS', rcs: 'RCS' };"""
replace_sched_labels = """const labels = { whatsapp: 'WhatsApp', whatsapp_app: 'WA App (Native)', email: 'Email', sms: 'SMS', rcs: 'RCS' };"""
content = content.replace(search_sched_labels, replace_sched_labels)

search_sched_icon = """<i className={`fas ${ch === 'whatsapp' ? 'fa-whatsapp' : ch === 'email' ? 'fa-envelope' : ch === 'sms' ? 'fa-comment-dots' : 'fa-comment-alt'}`}></i>"""
replace_sched_icon = """<i className={`fas ${ch === 'whatsapp' ? 'fa-whatsapp' : ch === 'whatsapp_app' ? 'fa-comment' : ch === 'email' ? 'fa-envelope' : ch === 'sms' ? 'fa-comment-dots' : 'fa-comment-alt'}`}></i>"""
content = content.replace(search_sched_icon, replace_sched_icon)

search_sched_dropdown = """                                                        <select 
                                                            value={channelSchedules[ch] ? 'schedule' : 'now'} 
                                                            onChange={(e) => {"""
replace_sched_dropdown = """                                                        {ch === 'whatsapp_app' ? (
                                                            <div style={{ fontSize: '0.7rem', color: '#059669', fontStyle: 'italic' }}>Immediate Top-1 Match Only</div>
                                                        ) : (
                                                        <select 
                                                            value={channelSchedules[ch] ? 'schedule' : 'now'} 
                                                            onChange={(e) => {"""

content = content.replace(search_sched_dropdown, replace_sched_dropdown)

search_sched_dropdown_close = """                                                        {channelSchedules[ch] && (
                                                            <input """
replace_sched_dropdown_close = """                                                        )}
                                                        {channelSchedules[ch] && (
                                                            <input """
content = content.replace(search_sched_dropdown_close, replace_sched_dropdown_close)

# 4. Handle whatsapp_app in handleSave
search_whatsapp_app_save = """                        const scheduledChannels = activeChannels.filter(ch => channelSchedules[ch]);
                        const nowChannels = activeChannels.filter(ch => !channelSchedules[ch]);"""
replace_whatsapp_app_save = """                        const scheduledChannels = activeChannels.filter(ch => channelSchedules[ch]);
                        const nowChannels = activeChannels.filter(ch => !channelSchedules[ch] && ch !== 'whatsapp_app');
                        const hasWhatsappApp = activeChannels.includes('whatsapp_app');"""
content = content.replace(search_whatsapp_app_save, replace_whatsapp_app_save)


search_save_wa = """                        // 2. Open Modal for Send Now Channels
                        if (nowChannels.length > 0) {"""
replace_save_wa = """                        if (hasWhatsappApp) {
                            // Only send to Top 1 for WA App
                            const topMatch = matches[0];
                            if (topMatch) {
                                const textPayload = `Hi ${topMatch.firstName || 'there'}! I have a highly recommended premium deal for you:\n\n${savedData.projectName || 'Premium Property'}${savedData.size ? ` (${savedData.size} ${savedData.sizeUnit})` : ''}\nPrice: ${savedData.price ? '₹'+new Intl.NumberFormat('en-IN').format(savedData.price) : 'On Request'}`;
                                const phone = (topMatch.mobile || topMatch.phone || '').replace(/\D/g, '');
                                const formattedPhone = phone.length === 10 ? `91${phone}` : phone;
                                window.open(`whatsapp://send?phone=${formattedPhone}&text=${encodeURIComponent(textPayload)}`, '_blank');
                            }
                        }

                        // 2. Open Modal for Send Now Channels
                        if (nowChannels.length > 0) {"""
content = content.replace(search_save_wa, replace_save_wa)

with open(file_path, "w") as f:
    f.write(content)

print("AddDealModal patch complete.")
