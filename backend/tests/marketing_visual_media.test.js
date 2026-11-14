import test from 'node:test';
import assert from 'node:assert/strict';
import { collectCrmHeroMediaCandidates } from '../services/BrandBannerComposer.js';
import { isAllowedMarketingMediaUrl, isPublicMarketingMediaIPv4 } from '../services/marketing/SafeMarketingMediaFetcher.js';

test('Designer CRM hero media resolver', async (t) => {
    await t.test('resolves Deal media including featured and broadcast images', () => {
        const deal = {
            websiteMetadata: { featuredImage: 'https://cdn.example.com/website.jpg' },
            broadcastMetadata: { images: ['https://cdn.example.com/broadcast.jpg'] },
            featuredImage: 'https://cdn.example.com/featured.jpg',
            images: ['https://cdn.example.com/deal.jpg']
        };
        assert.deepEqual(
            collectCrmHeroMediaCandidates(deal, 'https://cdn.example.com/custom.jpg'),
            [
                'https://cdn.example.com/custom.jpg',
                'https://cdn.example.com/featured.jpg',
                'https://cdn.example.com/website.jpg',
                'https://cdn.example.com/broadcast.jpg',
                'https://cdn.example.com/deal.jpg'
            ]
        );
    });

    await t.test('resolves Project projectImages and Inventory inventoryImages', () => {
        const project = {
            projectImages: [
                { title: 'Front elevation', url: 'https://cdn.example.com/project-front.jpg' },
                { title: 'Site', path: '/uploads/project-site.jpg' }
            ],
            projectVideos: [{ url: 'https://cdn.example.com/project-video.mp4' }]
        };
        const inventory = {
            inventoryImages: [{ url: 'https://cdn.example.com/inventory.jpg' }],
            inventoryVideos: [{ url: 'https://cdn.example.com/inventory-video.mp4' }],
            builtupDetails: [{ imageUrl: 'https://cdn.example.com/floor.jpg', videoUrl: 'https://cdn.example.com/floor.mp4' }]
        };
        assert.deepEqual(collectCrmHeroMediaCandidates(project), project.projectImages);
        assert.deepEqual(collectCrmHeroMediaCandidates(inventory), [
            ...inventory.inventoryImages,
            inventory.builtupDetails[0].imageUrl
        ]);
    });

    await t.test('does not treat PDF documents or video URLs as image candidates', () => {
        const entity = {
            projectDocuments: [{ url: 'https://cdn.example.com/title-deed.pdf' }],
            inventoryDocuments: [{ url: 'https://cdn.example.com/registry.pdf' }],
            projectVideos: [{ url: 'https://cdn.example.com/walkthrough.mp4' }],
            inventoryVideos: [{ url: 'https://cdn.example.com/tour.mp4' }]
        };
        assert.deepEqual(collectCrmHeroMediaCandidates(entity), []);
    });

    await t.test('returns an empty list when CRM media is absent', () => {
        assert.deepEqual(collectCrmHeroMediaCandidates({}), []);
    });
});

test('SSRF-safe marketing media fetch policy', async (t) => {
    await t.test('requires exact configured HTTPS host and rejects credentials, ports and redirects-by-origin', () => {
        const allowlist = new Set(['media.bharatproperties.co', 'cdn.example.com']);
        assert.equal(isAllowedMarketingMediaUrl('https://media.bharatproperties.co/property.jpg', allowlist), true);
        assert.equal(isAllowedMarketingMediaUrl('http://media.bharatproperties.co/property.jpg', allowlist), false);
        assert.equal(isAllowedMarketingMediaUrl('https://media.bharatproperties.co.evil.test/property.jpg', allowlist), false);
        assert.equal(isAllowedMarketingMediaUrl('https://user@media.bharatproperties.co/property.jpg', allowlist), false);
        assert.equal(isAllowedMarketingMediaUrl('https://media.bharatproperties.co:8443/property.jpg', allowlist), false);
        assert.equal(isAllowedMarketingMediaUrl('https://unlisted.example.test/property.jpg', allowlist), false);
    });

    await t.test('rejects loopback, private, link-local, carrier-grade NAT, documentation and multicast IPv4 ranges', () => {
        for (const address of [
            '0.1.2.3', '10.1.2.3', '100.64.0.1', '127.0.0.1',
            '169.254.10.10', '172.16.0.1', '172.31.255.254',
            '192.0.2.10', '192.168.1.1', '198.18.0.1',
            '198.51.100.2', '203.0.113.2', '224.0.0.1', '240.0.0.1'
        ]) {
            assert.equal(isPublicMarketingMediaIPv4(address), false, address);
        }
        assert.equal(isPublicMarketingMediaIPv4('8.8.8.8'), true);
        assert.equal(isPublicMarketingMediaIPv4('1.1.1.1'), true);
        assert.equal(isPublicMarketingMediaIPv4('::1'), false);
    });
});
