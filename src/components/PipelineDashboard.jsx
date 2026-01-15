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
    const menuRef = useRef(null);
    const [menuStyle, setMenuStyle] = useState({});

    // Open on Hover
    const handleMouseEnter = () => {
        if (itemRef.current) {
            const rect = itemRef.current.getBoundingClientRect();
            setMenuStyle({
                position: 'fixed',
                top: `${rect.bottom}px`,
                left: `${rect.left}px`,
                width: `${rect.width}px`,
                display: 'block',
                zIndex: 1000
            });
            setIsOpen(true);
        }
    };

    // Close on Leave
    const handleMouseLeave = () => {
        setIsOpen(false);
    };

    // Scroll Safety (Close if user scrolls to prevent detached floating menu)
    useEffect(() => {
        const handleScroll = () => {
            if (isOpen) setIsOpen(false);
        };
        if (isOpen) {
            window.addEventListener('scroll', handleScroll, { passive: true });
        }
        return () => {
            window.removeEventListener('scroll', handleScroll);
        };
    }, [isOpen]);

    return (
        <div
            className="pipeline-item"
            id="pipelineClosedItem"
            ref={itemRef}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            style={{ cursor: 'pointer' }}
        >
            <div className="pipeline-content-wrapper">
                <div>
                    <div className="pipeline-label">CLOSED</div>
                    <div className="pipeline-value"><i className="fas fa-chevron-down"></i></div>
                </div>
            </div>
            {/* Sub-stages Dropdown */}
            {isOpen && (
                <div
                    className="pipeline-sub-stages show"
                    ref={menuRef}
                    style={menuStyle}
                    onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside menu
                >
                    <div className="sub-stage-item success">
                        <div className="sub-label">Won</div>
                        <div className="sub-stats">
                            <span className="sub-val">1</span>
                            <span className="sub-percent">50%</span>
                        </div>
                    </div>
                    <div className="sub-stage-item danger">
                        <div className="sub-label">Lost</div>
                        <div className="sub-stats">
                            <span className="sub-val">0</span>
                            <span className="sub-percent">0%</span>
                        </div>
                    </div>
                    <div className="sub-stage-item neutral">
                        <div className="sub-label">Unqualified</div>
                        <div className="sub-stats">
                            <span className="sub-val">1</span>
                            <span className="sub-percent">50%</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default PipelineDashboard;
