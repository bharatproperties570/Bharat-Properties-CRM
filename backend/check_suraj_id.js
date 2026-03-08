
import mongoose from 'mongoose';

const mongoURI = 'mongodb+srv://bharatproperties:Bharat%40570@cluster0.7dehanz.mongodb.net/bharatproperties1';

const checkUser = async () => {
    try {
        await mongoose.connect(mongoURI);
        const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }), 'users');
        const user = await User.findOne({ name: /Suraj Keshwar/i });
        if (user) {
            console.log('User Found:', user._id, user.name);
        } else {
            console.log('User not found');
        }
        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
};

checkUser();
