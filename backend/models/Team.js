import mongoose from "mongoose";

const TeamSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, "Team name is required"],
        trim: true,
        unique: true
    },
    description: {
        type: String,
        trim: true
    },
    manager: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
    },
    department: {
        type: String,
        enum: {
            values: ['sales', 'marketing', 'inventory', 'accounts'],
            message: '{VALUE} is not a valid department'
        },
        required: [true, 'Department is required']
    },
    parentTeam: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Team",
        default: null
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes
TeamSchema.index({ department: 1, isActive: 1 });
TeamSchema.index({ manager: 1 });

// Virtuals
TeamSchema.virtual('members', {
    ref: 'User',
    localField: '_id',
    foreignField: 'team'
});

export default mongoose.model("Team", TeamSchema);
