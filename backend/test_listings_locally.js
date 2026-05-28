import connectDB from "./src/config/db.js";
import mongoose from "mongoose";
import Deal from "./models/Deal.js";

async function inspect() {
    await connectDB();
    const db = mongoose.connection.db;

    // Simulate getListings aggregation pipeline
    let query = { isPublished: true };
    const listings = await Deal.aggregate([
        { $match: query },
        {
            $lookup: {
                from: 'activities',
                let: { dealId: '$_id' },
                pipeline: [
                    { $match: { 
                        $expr: { $eq: ['$entityId', '$$dealId'] },
                        type: 'Site Visit',
                        status: 'Completed'
                    }}
                ],
                as: 'visits'
            }
        },
        {
            $lookup: {
                from: 'lookups',
                let: { subCatId: '$subCategory' },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $or: [
                                    { $eq: ['$_id', '$$subCatId'] },
                                    { 
                                        $eq: [
                                            '$_id', 
                                            { 
                                                $convert: { 
                                                    input: '$$subCatId', 
                                                    to: 'objectId', 
                                                    onError: null, 
                                                    onNull: null 
                                                } 
                                            }
                                        ] 
                                    }
                                ]
                            }
                        }
                    }
                ],
                as: 'resolvedSubCategory'
            }
        },
        {
            $addFields: {
                siteVisitCount: { $size: '$visits' },
                id: '$_id',
                subCategory: { 
                    $ifNull: [
                        { $arrayElemAt: ['$resolvedSubCategory.lookup_value', 0] }, 
                        { $ifNull: ['$subCategoryName', '$subCategory'] }
                    ] 
                }
            }
        },
        {
            $lookup: {
                from: 'inventories',
                let: { invId: '$inventoryId', projName: '$projectName', blk: '$block', unt: '$unitNo' },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $or: [
                                    { $and: [{ $ne: ['$$invId', null] }, { $eq: ['$_id', '$$invId'] }] },
                                    { $and: [
                                        { $ne: ['$$projName', null] },
                                        { $ne: ['$$unt', null] },
                                        { $eq: ['$projectName', '$$projName'] },
                                        { $eq: ['$block', '$$blk'] },
                                        { $or: [
                                            { $eq: ['$unitNo', '$$unt'] },
                                            { $eq: ['$unitNumber', '$$unt'] }
                                        ]}
                                    ]}
                                ]
                            }
                        }
                    }
                ],
                as: 'inventoryData'
            }
        },
        {
            $addFields: {
                inventoryInfo: { $arrayElemAt: ['$inventoryData', 0] }
            }
        },
        {
            $addFields: {
                propertyDetails: { $ifNull: ['$propertyDetails', '$inventoryInfo.propertyDetails'] },
                unitSpecification: { $ifNull: ['$unitSpecification', '$inventoryInfo.unitSpecification'] },
                address: { $ifNull: ['$address', '$inventoryInfo.address'] },
                sizeLabel: { $ifNull: ['$sizeLabel', { $ifNull: ['$unitSpecification.sizeLabel', '$inventoryInfo.sizeLabel'] }] },
                subCategory: { $ifNull: ['$subCategory', '$inventoryInfo.subCategory'] },
                images: {
                    $cond: {
                        if: { $gt: [ { $size: { $ifNull: [ '$websiteMetadata.images', [] ] } }, 0 ] },
                        then: '$websiteMetadata.images',
                        else: { $ifNull: [ '$inventoryInfo.inventoryImages', [] ] }
                    }
                },
                videos: {
                    $cond: {
                        if: { $gt: [ { $size: { $ifNull: [ '$websiteMetadata.videos', [] ] } }, 0 ] },
                        then: '$websiteMetadata.videos',
                        else: { $ifNull: [ '$inventoryInfo.inventoryVideos', [] ] }
                    }
                },
                builtupDetails: {
                    $cond: {
                        if: { $gt: [ { $size: { $ifNull: [ '$builtupDetails', [] ] } }, 0 ] },
                        then: '$builtupDetails',
                        else: { $ifNull: [ '$inventoryInfo.builtupDetails', [] ] }
                    }
                }
            }
        }
    ]);

    console.log("AGGREGATED LISTINGS COUNT:", listings.length);
    for (const listing of listings) {
        console.log(`\n========================================`);
        console.log(`DEAL ID: ${listing._id}`);
        console.log(`projectName: "${listing.projectName}", unitNo: "${listing.unitNo}"`);
        console.log(`images:`, listing.images);
        console.log(`builtupDetails:`, JSON.stringify(listing.builtupDetails, null, 2));
    }
    
    process.exit(0);
}
inspect();
