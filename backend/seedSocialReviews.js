import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SocialReview from './models/SocialReview.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/bharatproperties';

const MOCK_REVIEWS = [
    {
        author_name: "Meera Sharma",
        rating: 5,
        text: "Found our dream home in Kurukshetra through Bharat Properties. Their Facebook support was incredibly fast and helpful!",
        platform: 'facebook',
        time: Math.floor(Date.now() / 1000) - 86400 * 5, // 5 days ago
        relative_time_description: "5 days ago",
        profile_photo_url: "https://ui-avatars.com/api/?name=Meera+Sharma&background=1877F2&color=fff"
    },
    {
        author_name: "Arjun Khanna",
        rating: 5,
        text: "The property tour shared on their Instagram convinced us to visit. Extremely professional team and great luxury options.",
        platform: 'instagram',
        time: Math.floor(Date.now() / 1000) - 86400 * 10, // 10 days ago
        relative_time_description: "1 week ago",
        profile_photo_url: "https://ui-avatars.com/api/?name=Arjun+Khanna&background=E1306C&color=fff"
    },
    {
        author_name: "Dr. Sameer Gupta",
        rating: 5,
        text: "Connected with Bharat Properties via LinkedIn for a commercial plot. Their market analysis is data-driven and reliable.",
        platform: 'linkedin',
        time: Math.floor(Date.now() / 1000) - 86400 * 30, // 1 month ago
        relative_time_description: "1 month ago",
        profile_photo_url: "https://ui-avatars.com/api/?name=Sameer+Gupta&background=0077B5&color=fff"
    },
    {
        author_name: "Rahul Verma",
        rating: 4,
        text: "Quick response on X regarding Sector 7 plots. Appreciate the transparency in pricing.",
        platform: 'twitter',
        time: Math.floor(Date.now() / 1000) - 86400 * 2, // 2 days ago
        relative_time_description: "2 days ago",
        profile_photo_url: "https://ui-avatars.com/api/?name=Rahul+Verma&background=000&color=fff"
    }
];

async function seedReviews() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log("Connected to MongoDB");

        for (const review of MOCK_REVIEWS) {
            await SocialReview.updateOne(
                { author_name: review.author_name, platform: review.platform, text: review.text },
                { $set: review },
                { upsert: true }
            );
        }

        console.log("Mock reviews seeded successfully!");
        process.exit(0);
    } catch (error) {
        console.error("Error seeding reviews:", error);
        process.exit(1);
    }
}

seedReviews();
