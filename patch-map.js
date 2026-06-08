import fs from 'fs';
let content = fs.readFileSync('src/pages/Deals/DealsPage.jsx', 'utf8');
content = content.replace(
    /items=\{filteredDeals\}/g,
    'items={filteredDeals}\n                                    dealScores={dealScores}'
);
fs.writeFileSync('src/pages/Deals/DealsPage.jsx', content);
