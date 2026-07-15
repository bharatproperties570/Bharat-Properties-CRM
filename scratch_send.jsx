    const handleSendBlast = async () => {
        const selectedDeals = matchedItems.filter(item => selectedItems.includes(item.id || item.unitNo));
        if (selectedDeals.length === 0) {
            toast.error('Please select at least one property to blast.');
            return;
        }

        const activeChannels = Object.keys(blastChannels).filter(k => blastChannels[k]);
        if (activeChannels.length === 0) {
            toast.error('Please select at least one channel (WhatsApp, Email, or SMS).');
            return;
        }

        setIsBlasting(true);
        const loadToast = toast.loading(`Dispatching to ${activeChannels.length} channel(s)...`);

        try {
            const dealIds = selectedDeals.map(d => d._id || d.id);
            
            // Native WhatsApp App fallback (runs locally)
            if (blastChannels.whatsapp_app) {
                // Generate simple text fallback for local app
                let textPayload = `Hi ${lead?.firstName || lead?.name || 'there'}! I've curated a list of properties for you:\n\n`;
                selectedDeals.forEach((d, i) => {
                    let line = `${i+1}. ${d.projectName}`;
                    if (portfolioDetailLevel.includes('extended') && d.unitNo) line += ` (Unit: ${d.unitNo})`;
                    if (portfolioDetailLevel.includes('full')) {
                        if (d.location) line += ` in ${d.location}`;
                        if (d.size) line += ` | Size: ${d.size}`;
                    }
                    line += ` - ${d.price && !hidePrice ? '₹'+d.price : 'Price on request'}`;
                    textPayload += line + '\n';
                });
                const phone = (lead?.mobile || lead?.phone || '').replace(/\D/g, '');
                const formattedPhone = phone.length === 10 ? `91${phone}` : phone;
                window.open(`whatsapp://send?phone=${formattedPhone}&text=${encodeURIComponent(textPayload)}`, '_blank');
            }

            // Enterprise Unified API Calls for scheduled/now sending
            // We'll iterate through all channels EXCEPT whatsapp_app to invoke the manual sender
            const dispatchPromises = [];
            
            ['whatsapp', 'email', 'sms', 'rcs'].forEach(ch => {
                if (blastChannels[ch]) {
                    dispatchPromises.push(
                        api.post('marketing/send-manual', {
                            leadId: lead._id,
                            dealIds,
                            toggles: { [ch]: true },
                            scheduledAt: channelSchedules?.[ch] || undefined,
                            hidePrice,
                            matchContext: portfolioDetailLevel.includes('short') ? 'top' : 'perfect'
                        }).catch(e => console.error(`[Dispatch] Error on ${ch}:`, e))
                    );
                }
            });

            if (dispatchPromises.length > 0) {
                await Promise.all(dispatchPromises);
            }

            toast.success(`Omnichannel dispatch processed via Enterprise Queue!`, { id: loadToast });
        } catch (error) {
            toast.error('Dispatch encountered an issue.', { id: loadToast });
        } finally {
            setIsBlasting(false);
        }
    };
