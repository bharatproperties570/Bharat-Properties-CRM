import React from 'react';
import DealBroadcastModal from '../../Deals/components/DealBroadcastModal';

/**
 * Enterprise Project Omnichannel Broadcast Modal
 * Reuses the PR39 5-pillar reliable WhatsApp, SMS, RCS, and Email broadcast engine
 * for Project marketing campaigns, matched buyer pools, BNA partner broker circles,
 * and investor WhatsApp groups.
 */
const ProjectBroadcastModal = ({ isOpen, onClose, project, deals = [], onSuccess }) => {
    if (!isOpen) return null;

    return (
        <DealBroadcastModal
            isOpen={isOpen}
            onClose={onClose}
            project={project}
            projectId={project?._id || project?.id}
            selectedDeals={deals}
            dealIds={Array.isArray(deals) ? deals.map(d => d._id || d.id).filter(Boolean) : []}
            onSuccess={onSuccess}
        />
    );
};

export default ProjectBroadcastModal;
