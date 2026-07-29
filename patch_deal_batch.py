import re

with open("src/pages/Deals/views/DealMatchingPage.jsx", "r") as f:
    content = f.read()

start_idx = content.find("            {/* ─── BATCH BAR ─── */}")
end_idx = content.find("            <CreateActivityModal", start_idx)

if start_idx != -1 and end_idx != -1:
    new_panel = """
            {/* ─── OMNICHANNEL DISPATCH BAR ─── */}
            {selectedLeads.length > 0 && (
                <div style={{ position: 'fixed', bottom: '28px', left: '50%', transform: 'translateX(-50%)', background: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)', padding: '16px 24px', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '16px', boxShadow: isDark ? '0 25px 50px -12px rgba(0,0,0,0.8)' : '0 20px 40px -10px rgba(0,0,0,0.1)', zIndex: 1000, border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.05)', backdropFilter: 'blur(16px)', flexWrap: 'wrap' }}>
                    
                    {/* Selected Count */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingRight: '16px', borderRight: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '0.9rem', color: '#fff', boxShadow: '0 4px 10px rgba(59, 130, 246, 0.3)' }}>{selectedLeads.length}</div>
                        <span style={{ color: txt, fontWeight: 700, fontSize: '0.95rem' }}>leads</span>
                    </div>

                    {/* Channels & Schedulers */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {['whatsapp', 'email', 'sms'].map(ch => (
                            <div key={ch} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <button 
                                    onClick={() => setBlastChannels(prev => ({...prev, [ch]: !prev[ch]}))}
                                    style={{ 
                                        padding: '8px 14px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 700, transition: 'all 0.2s', border: 'none',
                                        background: blastChannels[ch] ? (ch === 'whatsapp' ? '#10b981' : ch === 'email' ? '#3b82f6' : '#8b5cf6') : (isDark ? '#334155' : '#e2e8f0'), 
                                        color: blastChannels[ch] ? '#fff' : sub, 
                                        cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', gap: '8px', 
                                        outline: blastChannels[ch] ? `2px solid ${ch === 'whatsapp' ? '#059669' : ch === 'email' ? '#2563eb' : '#7c3aed'}` : 'none'
                                    }}>
                                    <i className={`fa${ch==='whatsapp'?'b':'s'} fa-${ch==='whatsapp'?'whatsapp':ch==='email'?'envelope':'comment-dots'}`}></i> {ch === 'whatsapp' ? 'WA API' : ch.toUpperCase()}
                                </button>
                                {blastChannels[ch] && (
                                    <div style={{ display: 'flex', gap: '4px' }}>
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
                                            style={{ padding: '4px', borderRadius: '6px', border: `1px solid ${brd}`, background: card, color: txt, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
                                        >
                                            <option value="now">Send Now</option>
                                            <option value="schedule">Schedule</option>
                                        </select>
                                        {channelSchedules[ch] && (
                                            <input 
                                                type="datetime-local"
                                                value={channelSchedules[ch]}
                                                onChange={(e) => setChannelSchedules(prev => ({...prev, [ch]: e.target.value}))}
                                                style={{ padding: '4px', borderRadius: '6px', border: `1px solid ${brd}`, background: card, color: txt, fontSize: '0.75rem', cursor: 'pointer' }}
                                            />
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}

                        <button 
                            onClick={() => setBlastChannels(prev => ({...prev, rcs: !prev.rcs}))}
                            style={{ 
                                padding: '8px 14px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 700, transition: 'all 0.2s', border: 'none',
                                background: blastChannels.rcs ? '#0ea5e9' : (isDark ? '#334155' : '#e2e8f0'), color: blastChannels.rcs ? '#fff' : sub, 
                                cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '8px', outline: blastChannels.rcs ? '2px solid #0284c7' : 'none'
                            }}>
                            <i className="fas fa-mobile-alt"></i> RCS
                        </button>
                        
                        <button 
                            onClick={() => setBlastChannels(prev => ({...prev, whatsapp_app: !prev.whatsapp_app}))}
                            style={{ 
                                padding: '8px 14px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 700, transition: 'all 0.2s', border: 'none',
                                background: blastChannels.whatsapp_app ? '#059669' : (isDark ? '#334155' : '#e2e8f0'), color: blastChannels.whatsapp_app ? '#fff' : sub, 
                                cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '8px', outline: blastChannels.whatsapp_app ? '2px solid #047857' : 'none'
                            }}>
                            <i className="fas fa-comment"></i> WA App
                        </button>
                    </div>

                    <div style={{ width: '1px', height: '32px', background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', margin: '0 8px' }}></div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: txt }}>
                            <input type="checkbox" checked={hidePrice} onChange={e => setHidePrice(e.target.checked)} style={{ cursor: 'pointer' }} />
                            Hide Price
                        </label>
                    </div>

                    <div style={{ width: '1px', height: '32px', background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', margin: '0 8px' }}></div>

                    {/* Submit & Cancel */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <button 
                            onClick={handleSendBlast}
                            disabled={isBlasting || (!blastChannels.whatsapp && !blastChannels.email && !blastChannels.sms && !blastChannels.whatsapp_app && !blastChannels.rcs)}
                            style={{ 
                                padding: '10px 24px', borderRadius: '20px', background: 'linear-gradient(135deg, #ec4899 0%, #f43f5e 100%)', 
                                color: '#fff', border: 'none', fontWeight: 800, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer',
                                opacity: isBlasting ? 0.7 : 1, transition: 'all 0.2s', boxShadow: '0 8px 20px -6px rgba(236, 72, 153, 0.6)'
                            }}
                            onMouseOver={(e) => { if(!isBlasting) e.currentTarget.style.transform = 'translateY(-2px)'; }}
                            onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                        >
                            {isBlasting ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-paper-plane"></i>}
                            {isBlasting ? 'DISPATCHING...' : 'DISPATCH NOW'}
                        </button>

                        <button onClick={() => setSelectedLeads([])} style={{ width: '36px', height: '36px', borderRadius: '12px', background: isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9', border: `1px solid ${brd}`, color: sub, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }} onMouseOver={e => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0'} onMouseOut={e => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9'}>
                            <i className="fas fa-times"></i>
                        </button>
                    </div>
                </div>
            )}

"""
    content = content[:start_idx] + new_panel + content[end_idx:]
    with open("src/pages/Deals/views/DealMatchingPage.jsx", "w") as f:
        f.write(content)
    print("Replaced Batch Bar with Omnichannel Dispatch Bar")
else:
    print(f"Could not find indices: {start_idx}, {end_idx}")

