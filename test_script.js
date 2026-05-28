const leadMasterFields = {
        campaigns: [
            {
                name: 'Offline Campaign',
                sources: [
                    { name: 'Cold Call', mediums: ['Database 1', 'Database 2'] },
                    { name: 'Newspaper Ad', mediums: ['Times of India', 'Hindustan Times'] },
                    { name: 'Hoarding', mediums: ['Sector 18', 'Main Highway'] }
                ]
            }
        ]
};

const allCampaigns = leadMasterFields?.campaigns || [];
const allSources = [];
allCampaigns.forEach(camp => {
    if (camp.sources && camp.sources.length > 0) {
        camp.sources.forEach(src => {
            if (!allSources.some(s => s.name === src.name)) allSources.push(src);
        });
    }
});
console.log(allSources);
