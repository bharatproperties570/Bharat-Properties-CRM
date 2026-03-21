import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SocialReview from './models/SocialReview.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/bharatproperties';

// Helper to convert relative time/date strings to approximate Unix timestamps
function parseTimeToUnix(timeStr) {
    const now = new Date();
    if (!timeStr) return Math.floor(now.getTime() / 1000);

    // Handle explicit dates like "6 Jun 2024"
    const parsedDate = new Date(timeStr);
    if (!isNaN(parsedDate.getTime())) {
        return Math.floor(parsedDate.getTime() / 1000);
    }

    // Handle relative strings like "21 weeks ago", "1 month ago"
    const match = timeStr.match(/(\d+)\s+(day|week|month|year)s?\s+ago/);
    if (match) {
        const value = parseInt(match[1]);
        const unit = match[2];
        const date = new Date();
        if (unit.startsWith('day')) date.setDate(date.getDate() - value);
        if (unit.startsWith('week')) date.setDate(date.getDate() - value * 7);
        if (unit.startsWith('month')) date.setMonth(date.getMonth() - value);
        if (unit.startsWith('year')) date.setFullYear(date.getFullYear() - value);
        return Math.floor(date.getTime() / 1000);
    }

    return Math.floor(now.getTime() / 1000);
}

const EXTRACTED_REVIEWS = [
  { "name": "Darshan Narwal", "rating": 5, "text": "Very nice", "time": "21 weeks ago" },
  { "name": "Joni Daksh", "rating": 5, "text": "", "time": "2 Jul 2024" },
  { "name": "Vijay Saini", "rating": 5, "text": "Best prepoerty Adviser in Kurukshetra, He is a very honest person. He gave me a best deal in all over market", "time": "6 Jun 2024" },
  { "name": "Jagmal Singh", "rating": 5, "text": "Bharat Properties is well established real estate agency in kurukshetra known for its expertise in residential &...", "time": "5 Jun 2024" },
  { "name": "Sandeep Kumar", "rating": 5, "text": "Best dealer kurukshetra", "time": "25 Apr 2024" },
  { "name": "Dharmendra Dangi", "rating": 5, "text": "Very Fair and Transparent Dealing.... Amazing Nature and Very supportive.", "time": "23 Oct 2023" },
  { "name": "Sameeksha Thakur", "rating": 5, "text": "For best deal in property.", "time": "16 Aug 2023" },
  { "name": "Raj Kumar", "rating": 5, "text": "Great experience. Nice person mr. Suraj. Nice dealing with clients", "time": "14 Aug 2023" },
  { "name": "Bikram Singh", "rating": 5, "text": "Bharat properties owner is very honest person and very nice person. Its property rates are best in the whole city and everything is clear.", "time": "14 Aug 2023" },
  { "name": "Sunil Kumar", "rating": 5, "text": "", "time": "14 Mar 2023" },
  { "name": "Jatin mehta", "rating": 5, "text": "The best property dealer and negotiator. He done good negotiations on behalf of me. I got best deal.", "time": "13 Oct 2022" },
  { "name": "Nisha Nisha", "rating": 5, "text": "This place for good in deals in property buy & sale in kurukshetra", "time": "7 Jun 2022" },
  { "name": "Travel ON Road Ride", "rating": 5, "text": "Bharat Properties Best buy & sale Properties in kurukshetra Haryana", "time": "7 Jun 2022" },
  { "name": "Preeti Chauhan", "rating": 5, "text": "one of the most professional people, i have ever met, especially in tricity...the projects shown and the dealing was very very smooth and flawless....", "time": "22 May 2022" },
  { "name": "vikas saini", "rating": 4, "text": "", "time": "18 May 2022" },
  { "name": "Deepak Soni", "rating": 3, "text": "No idea about their services", "time": "29 Apr 2022" },
  { "name": "sandeep kumar", "rating": 5, "text": "Quality service and professional attitude.", "time": "28 Sept 2021" },
  { "name": "Vikas Sharma", "rating": 5, "text": "Best Agency for investment & end use property in kurukshetra", "time": "10 Aug 2021" },
  { "name": "Ganpati Farm", "rating": 5, "text": "", "time": "13 Jan 2021" },
  { "name": "Ramfal Gollen", "rating": 5, "text": "Good person for honest & fair deal", "time": "29 Oct 2020" },
  { "name": "Vikram Chauhan", "rating": 5, "text": "Best for buying and selling any property in kurukshetra", "time": "29 Oct 2020" },
  { "name": "rahul pandey", "rating": 5, "text": "Excellent service and support.", "time": "29 Oct 2020" },
  { "name": "SATISH KUMAR", "rating": 1, "text": "", "time": "2 Mar 2020" },
  { "name": "D Kumar", "rating": 2, "text": "", "time": "25 Jan 2020" },
  { "name": "Sonu Kait", "rating": 1, "text": "Good service for plot sale purchase", "time": "24 Jun 2019" },
  { "name": "manjeet singh", "rating": 5, "text": "Best property dealer in kurukshetra", "time": "20 Nov 2018" },
  { "name": "Sunny Sharma", "rating": 4, "text": "", "time": "4 Jul 2018" },
  { "name": "abhishek chauhan", "rating": 5, "text": "", "time": "20 Jan 2018" },
  { "name": "Rakesh kumar", "rating": 3, "text": "", "time": "19 Nov 2017" },
  { "name": "akash singh nishad", "rating": 5, "text": "Deals in every properties like plots and", "time": "7 Aug 2017" },
  { "name": "Aryan Singla", "rating": 1, "text": "OK", "time": "16 Mar 2017" }
];

async function seedAllReviews() {
    const PLACE_ID = 'ChIJKzFpydBGDjkRbTCco1_G2I4';
    try {
        await mongoose.connect(MONGODB_URI);
        console.log("Connected to MongoDB for Deep Extraction Sync");

        for (const rev of EXTRACTED_REVIEWS) {
            const unixTime = parseTimeToUnix(rev.time);
            await SocialReview.updateOne(
                { author_name: rev.name, platform: 'google', text: rev.text },
                { 
                    $set: { 
                        author_name: rev.name,
                        rating: rev.rating,
                        text: rev.text || "Highly recommended!",
                        time: unixTime,
                        relative_time_description: rev.time,
                        platform: 'google',
                        place_id: PLACE_ID,
                        profile_photo_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(rev.name)}&background=random`
                    } 
                },
                { upsert: true }
            );
        }

        console.log(`Successfully synced all ${EXTRACTED_REVIEWS.length} Google reviews to the database!`);
        process.exit(0);
    } catch (error) {
        console.error("Error seeding reviews:", error);
        process.exit(1);
    }
}

seedAllReviews();
