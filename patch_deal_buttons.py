import re

with open("src/pages/Deals/views/DealMatchingPage.jsx", "r") as f:
    content = f.read()

start_idx = content.find("                                            {/* Action Buttons */}")
end_idx = content.find("                                            </div>\n                                        </div>", start_idx)

if start_idx != -1 and end_idx != -1:
    new_buttons = """                                            {/* Action Buttons */}
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' }}>
                                                <div style={{ display: 'flex', gap: '5px' }}>
                                                    <button title="Call" onClick={() => window.open(`tel:${lead.mobile}`)} style={{ width: '34px', height: '34px', borderRadius: '9px', border: '1px solid #dcfce7', background: isDark ? 'rgba(16,185,129,0.1)' : '#f0fdf4', color: '#15803d', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', transition: 'all 0.15s' }}>
                                                        <i className="fas fa-phone-alt"></i>
                                                    </button>
                                                    <button title="WhatsApp" onClick={() => window.open(`https://wa.me/91${lead.mobile}`, '_blank')} style={{ width: '34px', height: '34px', borderRadius: '9px', border: '1px solid #dcfce7', background: isDark ? 'rgba(37,211,102,0.1)' : '#f0fdf4', color: '#16a34a', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', transition: 'all 0.15s' }}>
                                                        <i className="fab fa-whatsapp"></i>
                                                    </button>
                                                </div>
                                                <button onClick={() => { setActivityInitialData({ activityType: 'Site Visit', relatedTo: [{ id: lead.mobile, name: `${lead.firstName} ${lead.lastName || ''}`.trim() }] }); setIsActivityOpen(true); }} style={{ padding: '6px 12px', borderRadius: '8px', border: `1px solid ${brd}`, background: card, color: txt, fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s' }}>
                                                    <i className="fas fa-calendar-plus" style={{ marginRight: '5px', color: '#2563eb' }}></i>Schedule Visit
                                                </button>"""
    content = content[:start_idx] + new_buttons + content[end_idx:]
    with open("src/pages/Deals/views/DealMatchingPage.jsx", "w") as f:
        f.write(content)
    print("Patched Action Buttons")
else:
    print(f"Could not find indices: {start_idx}, {end_idx}")

