import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../models/User.js";
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load env vars
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

const users = [
    {
        name: "Amit Sharma",
        email: "amit@bharatproperties.com",
        password: "password123",
        role: "admin",
        avatar: "https://i.pravatar.cc/150?u=amit"
    },
    {
        name: "Rohan Verma",
        email: "rohan@bharatproperties.com",
        password: "password123",
        role: "manager",
        avatar: "https://i.pravatar.cc/150?u=rohan"
    },
    {
        name: "Priya Singh",
        email: "priya@bharatproperties.com",
        password: "password123",
        role: "sales",
        avatar: "https://i.pravatar.cc/150?u=priya"
    },
    {
        name: "Vikram Malhotra",
        email: "vikram@bharatproperties.com",
        password: "password123",
        role: "sales",
        avatar: "https://i.pravatar.cc/150?u=vikram"
    },
    {
        name: "Sneha Gupta",
        email: "sneha@bharatproperties.com",
        password: "password123",
        role: "sales",
        avatar: "https://i.pravatar.cc/150?u=sneha"
    }
];

const seedUsers = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("MongoDB Connected for Seeding");

        // Clear existing users
        await User.deleteMany();
        console.log("Cleared existing users");

        // Insert new users
        await User.insertMany(users);
        console.log("Users seeded successfully");

        process.exit();
    } catch (error) {
        console.error("Error seeding users:", error);
        process.exit(1);
    }
};

seedUsers();
