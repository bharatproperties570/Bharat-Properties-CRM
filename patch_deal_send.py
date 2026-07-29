import re

with open("src/pages/Deals/views/DealMatchingPage.jsx", "r") as f:
    content = f.read()

# Find start of handleWhatsApp
start_idx = content.find("    // WhatsApp Handlers")
if start_idx == -1:
    start_idx = content.find("    const handleWhatsApp =")

# Find end of handleBatchMessage
end_idx = content.find("    const handleSelectLead =", start_idx)

if start_idx != -1 and end_idx != -1:
    new_func = """
    // --- Unified Omnichannel Dispatch ---
    const handleSendBlast = async () => {
        if (!dealId) return toast.error('No deal selected');
        if (selectedLeads.length === 0) return toast.error('Select at least one lead');
        if (!Object.values(blastChannels).some(v => v)) return toast.error('Select at least one channel');
        
        // Resolve leads
        const leadsToSend = matchedLeads.filter(l => selectedLeads.includes(l.mobile));
        
        setIsBlasting(true);
        const loadToast = toast.loading('Dispatching deal via selected channels...');

        try {
            // 1. Native WhatsApp App Fallback
            if (blastChannels.whatsapp_app) {
                // If it's just one or a few, we can open tabs. If it's many, maybe just one.
                const loc = deal ? renderVal(deal.location) : '';
                const priceStr = hidePrice ? 'Available on Request' : (deal ? formatIndianCurrency(deal.price || 0) : '');
                leadsToSend.forEach(l => {
                    const msg = `Hi ${l.firstName || 'there'}, we have a property matching your requirement at ${loc}. Price: ${priceStr}. Interested?`;
                    const encoded = encodeURIComponent(msg);
                    if (l.isPreferredMatch) {
                        window.open(`whatsapp://send?phone=91${l.mobile}&text=${encoded}`, '_blank');
                    } else {
                        window.open(`https://wa.me/91${l.mobile}?text=${encoded}`, '_blank');
                    }
                });
            }

            // 2. Enterprise Unified API Calls for scheduled/now sending
            const dispatchPromises = [];
            const apiChannels = ['whatsapp', 'email', 'sms', 'rcs'].filter(ch => blastChannels[ch]);
            
            if (apiChannels.length > 0) {
                dispatchPromises.push(
                    api.post('marketing/send-manual', {
                        dealId: deal._id,
                        leadIds: leadsToSend.map(l => l._id),
                        toggles: blastChannels,
                        scheduledAt: apiChannels.reduce((acc, ch) => {
                            if (channelSchedules[ch]) acc = channelSchedules[ch]; 
                            return acc;
                        }, undefined), // Simplified single schedule extraction
                        hidePrice,
                        matchContext: showOnlyPreferred ? 'perfect' : 'top'
                    })
                );
            }

            if (dispatchPromises.length > 0) {
                await Promise.all(dispatchPromises);
            }

            toast.success(`Omnichannel dispatch processed via Enterprise Queue!`, { id: loadToast });
            setSelectedLeads([]);
        } catch (error) {
            console.error(error);
            toast.error('Dispatch encountered an issue.', { id: loadToast });
        } finally {
            setIsBlasting(false);
        }
    };

"""
    content = content[:start_idx] + new_func + content[end_idx:]
    with open("src/pages/Deals/views/DealMatchingPage.jsx", "w") as f:
        f.write(content)
    print("Replaced functions with handleSendBlast")
else:
    print(f"Could not find indices: {start_idx}, {end_idx}")

