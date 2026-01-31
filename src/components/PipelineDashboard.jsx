import React, { useState, useRef, useEffect } from 'react';

function PipelineDashboard() {
    return (
        <div className="pipeline-dashboard" id="pipelineDashboard">
            <PipelineItem label="INCOMING" value="1" percent="10%" />
            <PipelineItem label="PROSPECT" value="2" percent="35%" />
            <PipelineItem label="OPPORTUNITY" value="1" percent="10%" />
            <PipelineItem label="NEGOTIATION" value="1" percent="25%" />

            {/* Closed Stage with Dropdown Logic */}
            <ClosedPipelineItem />
        </div>
    );
}

function PipelineItem({ label, value, percent }) {
    return (
        <div className="pipeline-item">
            <div className="pipeline-content-wrapper">
                <div>
                    <div className="pipeline-label">{label}</div>
                    <div className="pipeline-value">{value}</div>
                </div>
                <div className="pipeline-percent">{percent}</div>
            </div>
        </div>
    );
}

function ClosedPipelineItem() {
    const [isOpen, setIsOpen] = useState(false);
    const itemRef = useRef(null);
    const [menuStyle, setMenuStyle] = useState({});

    const toggleMenu = (e) => {
        e.stopPropagation();
        if (!isOpen && itemRef.current) {
            const rect = itemRef.current.getBoundingClientRect();
            setMenuStyle({
                position: 'fixed',
                top: `${rect.bottom + 4}px`, // Slight gap
                left: `${rect.left}px`,
                width: `${rect.width}px`,
                zIndex: 9999, // High z-index to ensure visibility
                background: '#fff',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                overflow: 'hidden'
            });
            setIsOpen(true);
        } else {
            setIsOpen(false);
        }
    };

    // Close on window scroll/resize to prevent detached menu
    useEffect(() => {
        const handleGlobalClick = () => setIsOpen(false);
        const handleScroll = () => { if (isOpen) setIsOpen(false); };

        if (isOpen) {
            window.addEventListener('click', handleGlobalClick);
            window.addEventListener('scroll', handleScroll, { capture: true }); // Capture to detect any scroll
            window.addEventListener('resize', handleScroll);
        }

        return () => {
            window.removeEventListener('click', handleGlobalClick);
            window.removeEventListener('scroll', handleScroll, { capture: true });
            window.removeEventListener('resize', handleScroll);
        };
    }, [isOpen]);

    return (
        <div
            className="pipeline-item"
            style={{
                cursor: 'pointer',
                background: isOpen ? '#f8fafc' : undefined
            }}
            onClick={toggleMenu}
            ref={itemRef}
        >
            <div className="pipeline-content-wrapper">
                <div>
                    <div className="pipeline-label">CLOSED <i className={`fas fa-chevron-${isOpen ? 'up' : 'down'}`} style={{ fontSize: '0.7em', marginLeft: '5px' }}></i></div>
                    <div className="pipeline-value">2</div>
                </div>
                {/* Total Percent */}
                <div className="pipeline-percent">100%</div>
            </div>

            {/* Sub-stages Dropdown - Fixed Position */}
            {isOpen && (
                <div
                    className="pipeline-sub-stages show" // Keep class for existing styles if any
                    style={menuStyle}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="sub-stage-item success" style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div className="sub-label" style={{ fontSize: '0.75rem', fontWeight: 600, color: '#166534' }}>Won</div>
                        <div className="sub-stats" style={{ display: 'flex', gap: '8px', fontSize: '0.75rem' }}>
                            <span className="sub-val" style={{ fontWeight: 700 }}>1</span>
                            <span className="sub-percent" style={{ color: '#64748b' }}>50%</span>
                        </div>
                    </div>
                    <div className="sub-stage-item neutral" style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div className="sub-label" style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>Unqualified</div>
                        <div className="sub-stats" style={{ display: 'flex', gap: '8px', fontSize: '0.75rem' }}>
                            <span className="sub-val" style={{ fontWeight: 700 }}>1</span>
                            <span className="sub-percent" style={{ color: '#64748b' }}>50%</span>
                        </div>
                    </div>
                    <div className="sub-stage-item danger" style={{ padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div className="sub-label" style={{ fontSize: '0.75rem', fontWeight: 600, color: '#991b1b' }}>Lost</div>
                        <div className="sub-stats" style={{ display: 'flex', gap: '8px', fontSize: '0.75rem' }}>
                            <span className="sub-val" style={{ fontWeight: 700 }}>0</span>
                            <span className="sub-percent" style={{ color: '#64748b' }}>0%</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default PipelineDashboard;
