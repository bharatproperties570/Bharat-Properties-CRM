import mongoose from 'mongoose';

const GoogleReviewSchema = new mongoose.Schema({
    author_name: {
        type: String,
        required: true
    },
    author_url: String,
    profile_photo_url: String,
    rating: {
        type: Number,
        required: true
    },
    relative_time_description: String,
    text: {
        type: String,
        required: true
    },
    time: {
        type: Number,
        required: true
    },
    language: String,
    place_id: {
        type: String,
        required: true,
        index: true
    }
}, {
    timestamps: true
});

// Create a composite unique index to prevent duplicate reviews
// Using author_name and time as a unique identifier for a review at a specific place
GoogleReviewSchema.index({ author_name: 1, time: 1, place_id: 1 }, { unique: true });

export default mongoose.model('GoogleReview', GoogleReviewSchema);
