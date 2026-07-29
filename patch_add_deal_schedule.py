import re

file_path = "/Users/bharatproperties/.gemini/antigravity/scratch/bharat-properties-crm/src/components/AddDealModal.jsx"

with open(file_path, "r") as f:
    content = f.read()

# 1. Add state for channelSchedules
state_patch = """
    // AI Lead Matching State
    const [channelSchedules, setChannelSchedules] = useState({});"""
if "const [channelSchedules, setChannelSchedules]" not in content:
    content = content.replace("// AI Lead Matching State", state_patch)


# 2. Add UI for Dispatch Schedule
ui_patch_search = """                                </div>
                            </div>
                        </div>
                    </div>"""

ui_patch_replace = """                                </div>
                                {Object.values(formData.sendMatchedDeal || {}).some(v => v) && (
                                    <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>Dispatch Schedule</div>
                                        
                                        {['whatsapp', 'email', 'sms', 'rcs'].map(ch => {
                                            if (!formData.sendMatchedDeal[ch]) return null;
                                            const labels = { whatsapp: 'WhatsApp', email: 'Email', sms: 'SMS', rcs: 'RCS' };
                                            
                                            return (
                                                <div key={ch} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#fff', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: '#334155', fontWeight: 600 }}>
                                                        <i className={`fas ${ch === 'whatsapp' ? 'fa-whatsapp' : ch === 'email' ? 'fa-envelope' : ch === 'sms' ? 'fa-comment-dots' : 'fa-comment-alt'}`}></i>
                                                        {labels[ch]}
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <select 
                                                            value={channelSchedules[ch] ? 'schedule' : 'now'} 
                                                            onChange={(e) => {
                                                                if (e.target.value === 'now') {
                                                                    setChannelSchedules(prev => ({...prev, [ch]: ''}));
                                                                } else {
                                                                    const date = new Date();
                                                                    date.setHours(date.getHours() + 1);
                                                                    setChannelSchedules(prev => ({...prev, [ch]: date.toISOString().slice(0, 16)}));
                                                                }
                                                            }}
                                                            style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontSize: '0.75rem', outline: 'none' }}
                                                        >
                                                            <option value="now">Send Now (with Preview)</option>
                                                            <option value="schedule">Schedule Later</option>
                                                        </select>
                                                        
                                                        {channelSchedules[ch] && (
                                                            <input 
                                                                type="datetime-local"
                                                                value={channelSchedules[ch]}
                                                                onChange={(e) => setChannelSchedules(prev => ({...prev, [ch]: e.target.value}))}
                                                                style={{ padding: '3px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontSize: '0.75rem', outline: 'none' }}
                                                            />
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>"""

if "Dispatch Schedule" not in content:
    content = content.replace(ui_patch_search, ui_patch_replace)


# 3. Update handleSave logic to respect schedules
logic_search = """                        // Select primary channel
                        let primaryChannel = 'SMS';
                        if (formData.sendMatchedDeal.whatsapp) primaryChannel = 'WHATSAPP';
                        else if (formData.sendMatchedDeal.email) primaryChannel = 'EMAIL';
                        else if (formData.sendMatchedDeal.rcs) primaryChannel = 'RCS';

                        toast.success(`Found ${matches.length} matching leads! Opening Outreach Console...`, { id: loadToast });
                        
                        // Open SendMessageModal with matches
                        setMessageRecipients(matches.map(m => ({
                            id: m._id,
                            name: m.firstName + (m.lastName ? ' ' + m.lastName : ''),
                            phone: m.mobile || m.phone,
                            email: m.email
                        })));
                        setMessageInitialChannel(primaryChannel);
                        setCreatedDealContext(savedData);
                        setIsMessageOpen(true);
                        
                        onSave && onSave(savedData);
                        // Do not close AddDealModal immediately so the message modal remains visible above it
                        // (Alternatively, we can close AddDealModal, but since state is inside AddDealModal, it must stay open)
                        return; // Exit early to prevent onClose from firing"""

logic_replace = """                        const scheduledChannels = activeChannels.filter(ch => channelSchedules[ch]);
                        const nowChannels = activeChannels.filter(ch => !channelSchedules[ch]);

                        // 1. Dispatch Scheduled Channels in Background
                        for (let ch of scheduledChannels) {
                            try {
                                await api.post('marketing/send-manual', {
                                    dealIds: [savedData._id],
                                    leadIds: matches.map(m => m._id),
                                    toggles: { [ch]: true },
                                    scheduledAt: channelSchedules[ch],
                                    matchContext: 'perfect'
                                });
                            } catch(e) { console.error(`Failed to schedule ${ch}`, e); }
                        }

                        // 2. Open Modal for Send Now Channels
                        if (nowChannels.length > 0) {
                            let primaryChannel = 'SMS';
                            if (nowChannels.includes('whatsapp')) primaryChannel = 'WHATSAPP';
                            else if (nowChannels.includes('email')) primaryChannel = 'EMAIL';
                            else if (nowChannels.includes('rcs')) primaryChannel = 'RCS';

                            toast.success(`Found ${matches.length} matches! Opening console for immediate channels...`, { id: loadToast });
                            
                            setMessageRecipients(matches.map(m => ({
                                id: m._id,
                                name: m.firstName + (m.lastName ? ' ' + m.lastName : ''),
                                phone: m.mobile || m.phone,
                                email: m.email
                            })));
                            setMessageInitialChannel(primaryChannel);
                            setCreatedDealContext(savedData);
                            setIsMessageOpen(true);
                            
                            onSave && onSave(savedData);
                            return; // Exit early
                        } else {
                            toast.success(`Found ${matches.length} matches! Background schedules set successfully.`, { id: loadToast });
                        }"""

if "const scheduledChannels" not in content:
    content = content.replace(logic_search, logic_replace)

with open(file_path, "w") as f:
    f.write(content)

print("Schedule Patching complete.")
