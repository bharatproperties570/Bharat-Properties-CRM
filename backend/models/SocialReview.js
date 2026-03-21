import mongoose from 'mongoose';

const SocialReviewSchema = new mongoose.Schema({
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
    platform: {
        type: String,
        enum: ['google', 'facebook', 'instagram', 'linkedin', 'twitter', 'other'],
        default: 'google',
        required: true
    },
    place_id: {
        type: String,
        index: true
    }
}, {
    timestamps: true
});

// Create a composite unique index to prevent duplicate reviews
SocialReviewSchema.index({ author_name: 1, time: 1, platform: 1, text: 1 }, { unique: true });

export default mongoose.model('SocialReview', SocialReviewSchema);
