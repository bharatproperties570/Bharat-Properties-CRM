
import mongoose from 'mongoose';

const mongoURI = 'mongodb+srv://bharatproperties:Bharat%40570@cluster0.7dehanz.mongodb.net/bharatproperties1';

const checkUser = async () => {
    try {
        await mongoose.connect(mongoURI);
        const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }), 'users');
        const user = await User.findById('698de200eebee6c7a313dd32').lean();
        if (user) {
            console.log('User Found:', user.name);
        } else {
            console.log('User ID not found');
        }
        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
};

checkUser();
