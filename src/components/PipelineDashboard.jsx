import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

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
    const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });

    const updateCoords = () => {
        if (itemRef.current) {
            const rect = itemRef.current.getBoundingClientRect();
            setCoords({
                top: rect.bottom + window.scrollY + 4, // Absolute position relative to doc
                left: rect.left + window.scrollX,
                width: rect.width
            });
        }
    };

    const toggleMenu = (e) => {
        e.stopPropagation();
        if (!isOpen) {
            updateCoords();
            setIsOpen(true);
        } else {
            setIsOpen(false);
        }
    };

    // Handle Resize/Scroll to close or update
    useEffect(() => {
        const handleResize = () => setIsOpen(false); // Close on resize to avoid misalignment
        // For scroll, we can technically keep it open if we update coords, but closing is standard behavior for simple dropdowns
        const handleScroll = (e) => {
            // If scrolling happens inside the popup (if it had scroll), don't close.
            // But here popup is in body. So any scroll elsewhere should probably close it to avoid detachment.
            if (isOpen) setIsOpen(false);
        };

        if (isOpen) {
            window.addEventListener('resize', handleResize);
            window.addEventListener('scroll', handleScroll, { capture: true });
            window.addEventListener('click', () => setIsOpen(false)); // Global click listener
        }
        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('scroll', handleScroll, { capture: true });
            window.removeEventListener('click', () => setIsOpen(false));
        };
    }, [isOpen]);

    const dropdownContent = (
        <div
            className="pipeline-sub-stages-portal"
            style={{
                position: 'absolute',
                top: coords.top,
                left: coords.left,
                width: coords.width,
                zIndex: 99999,
                background: '#fff',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                overflow: 'hidden',
                animation: 'fadeIn 0.2s ease-out'
            }}
            onClick={(e) => e.stopPropagation()}
        >
            <div className="sub-stage-item success" style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'default' }}>
                <div className="sub-label" style={{ fontSize: '0.75rem', fontWeight: 600, color: '#166534' }}>Won</div>
                <div className="sub-stats" style={{ display: 'flex', gap: '8px', fontSize: '0.75rem' }}>
                    <span className="sub-val" style={{ fontWeight: 700 }}>1</span>
                    <span className="sub-percent" style={{ color: '#64748b' }}>50%</span>
                </div>
            </div>
            <div className="sub-stage-item neutral" style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'default' }}>
                <div className="sub-label" style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>Unqualified</div>
                <div className="sub-stats" style={{ display: 'flex', gap: '8px', fontSize: '0.75rem' }}>
                    <span className="sub-val" style={{ fontWeight: 700 }}>1</span>
                    <span className="sub-percent" style={{ color: '#64748b' }}>50%</span>
                </div>
            </div>
            <div className="sub-stage-item danger" style={{ padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'default' }}>
                <div className="sub-label" style={{ fontSize: '0.75rem', fontWeight: 600, color: '#991b1b' }}>Lost</div>
                <div className="sub-stats" style={{ display: 'flex', gap: '8px', fontSize: '0.75rem' }}>
                    <span className="sub-val" style={{ fontWeight: 700 }}>0</span>
                    <span className="sub-percent" style={{ color: '#64748b' }}>0%</span>
                </div>
            </div>
        </div>
    );

    return (
        <>
            <div
                className="pipeline-item"
                style={{
                    cursor: 'pointer',
                    background: isOpen ? '#f8fafc' : undefined,
                    transition: 'background 0.2s'
                }}
                onClick={toggleMenu}
                ref={itemRef}
            >
                <div className="pipeline-content-wrapper">
                    <div>
                        <div className="pipeline-label">CLOSED <i className={`fas fa-chevron-${isOpen ? 'up' : 'down'}`} style={{ fontSize: '0.7em', marginLeft: '5px', transition: 'transform 0.2s' }}></i></div>
                        <div className="pipeline-value">2</div>
                    </div>
                    {/* Total Percent */}
                    <div className="pipeline-percent">100%</div>
                </div>
            </div>
            {isOpen && createPortal(dropdownContent, document.body)}
        </>
    );
}

export default PipelineDashboard;
