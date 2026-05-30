import connectDB from "./src/config/db.js";
import mongoose from "mongoose";

async function dump() {
    await connectDB();
    const deal = await mongoose.connection.db.collection('deals').aggregate([
        { $match: { _id: new mongoose.Types.ObjectId('6a0ad751ee8126a476a15553') } },
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
                location: { $ifNull: ['$location', '$inventoryInfo.address.city'] },
                sizeLabel: { $ifNull: ['$sizeLabel', { $ifNull: ['$unitSpecification.sizeLabel', '$inventoryInfo.sizeLabel'] }] },
                subCategory: { $ifNull: ['$subCategory', '$inventoryInfo.subCategory'] },
                images: { $ifNull: ['$websiteMetadata.images', { $ifNull: ['$inventoryInfo.inventoryImages', []] }] },
                videos: { $ifNull: ['$websiteMetadata.videos', { $ifNull: ['$inventoryInfo.inventoryVideos', []] }] }
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
                                    { $eq: ['$_id', { $convert: { input: '$$subCatId', to: 'objectId', onError: null, onNull: null } }] }
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
                subCategory: {
                    $ifNull: [
                        { $arrayElemAt: ['$resolvedSubCategory.lookup_value', 0] },
                        { $ifNull: ['$subCategoryName', '$subCategory'] }
                    ]
                }
            }
        }
    ]).toArray();
    console.log("SUBCATEGORY:", deal[0].subCategory);
    console.log("DEAL DATA:", JSON.stringify(deal[0], null, 2));
    process.exit(0);
}
dump();
