import test from 'node:test';
import assert from 'node:assert/strict';
import { collectCrmHeroMediaCandidates } from '../services/BrandBannerComposer.js';

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
