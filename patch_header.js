const fs = require('fs');
const file = '/Users/bharatproperties/.gemini/antigravity/scratch/bharat-properties-crm/src/components/DealDetail/DealDetailHeader.jsx';
let data = fs.readFileSync(file, 'utf8');

// Add showCallMenu state
data = data.replace(/const \[showMoreMenu, setShowMoreMenu\] = useState\(false\);/, 
    "const [showMoreMenu, setShowMoreMenu] = useState(false);\n    const [showCallMenu, setShowCallMenu] = useState(false);\n" +
    `
    const getCallOptions = () => {
        const options = [];
        const owner = deal?.contactId || deal?.owner;
        if (owner) {
            if (owner.mobile) options.push({ label: \`Owner (\${owner.name || 'Primary'})\`, mobile: owner.mobile, contactObj: owner });
            if (owner.alternateMobile) options.push({ label: \`Owner (Alt)\`, mobile: owner.alternateMobile, contactObj: { ...owner, mobile: owner.alternateMobile } });
            if (owner.whatsappMobile && owner.whatsappMobile !== owner.mobile && owner.whatsappMobile !== owner.alternateMobile) {
                options.push({ label: \`Owner (WhatsApp)\`, mobile: owner.whatsappMobile, contactObj: { ...owner, mobile: owner.whatsappMobile } });
            }
        }
        const associate = deal?.associate || deal?.associatedContact || deal?.buyer;
        if (associate) {
            if (associate.mobile) options.push({ label: \`Associate (\${associate.name || 'Primary'})\`, mobile: associate.mobile, contactObj: associate });
            if (associate.alternateMobile) options.push({ label: \`Associate (Alt)\`, mobile: associate.alternateMobile, contactObj: { ...associate, mobile: associate.alternateMobile } });
        }
        return options;
    };
    const callOptions = getCallOptions();
`
);

// Replace Call button with a dropdown
const oldCallBtn = `                    <button
                        onClick={() => setIsCallModalOpen(true)}
                        style={{ border: 'none', background: 'rgba(241, 245, 249, 0.8)', color: '#475569', padding: '8px 14px', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                        <i className="fas fa-phone-alt" style={{ color: '#16a34a' }}></i> CALL
                    </button>`;

const newCallBtn = `                    <div style={{ position: 'relative' }}>
                        <button
                            onClick={() => {
                                if (callOptions.length === 1) {
                                    setIsCallModalOpen(callOptions[0].contactObj);
                                } else if (callOptions.length > 1) {
                                    setShowCallMenu(!showCallMenu);
                                } else {
                                    // Fallback if no numbers found, pass whatever deal.contactId is
                                    setIsCallModalOpen(deal?.contactId || true);
                                }
                            }}
                            style={{ border: 'none', background: 'rgba(241, 245, 249, 0.8)', color: '#475569', padding: '8px 14px', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                        >
                            <i className="fas fa-phone-alt" style={{ color: '#16a34a' }}></i> CALL {callOptions.length > 1 && <i className="fas fa-chevron-down" style={{fontSize:'0.65rem', marginLeft:'2px'}}></i>}
                        </button>
                        {showCallMenu && callOptions.length > 1 && (
                            <div style={{
                                position: 'absolute', top: '100%', right: 0, marginTop: '8px',
                                background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px',
                                boxShadow: '0 10px 25px rgba(0,0,0,0.1)', zIndex: 1000, minWidth: '180px',
                                padding: '8px 0', overflow: 'hidden'
                            }}>
                                {callOptions.map((opt, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => {
                                            setShowCallMenu(false);
                                            setIsCallModalOpen(opt.contactObj);
                                        }}
                                        style={{ width: '100%', textAlign: 'left', padding: '10px 16px', background: 'transparent', border: 'none', fontSize: '0.8rem', fontWeight: 600, color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}
                                        className="hover:bg-slate-50"
                                    >
                                        <i className="fas fa-phone" style={{ color: '#16a34a', width: '16px' }}></i>
                                        <div style={{display:'flex', flexDirection:'column'}}>
                                            <span>{opt.label}</span>
                                            <span style={{fontSize:'0.7rem', color:'#94a3b8'}}>{opt.mobile}</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>`;

data = data.replace(oldCallBtn, newCallBtn);
fs.writeFileSync(file, data);
