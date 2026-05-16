const mongoose = require('mongoose');
const { getInventory } = require('./backend/controllers/inventory.controller.js');
const User = require('./backend/models/User.js');
const Role = require('./backend/models/Role.js');

const uri = 'mongodb://bharatproperties:Bharat%40570@ac-xav0cir-shard-00-00.7dehanz.mongodb.net:27017,ac-xav0cir-shard-00-01.7dehanz.mongodb.net:27017,ac-xav0cir-shard-00-02.7dehanz.mongodb.net:27017/bharatproperties1?ssl=true&replicaSet=atlas-145yac-shard-0&authSource=admin&retryWrites=true&w=majority';

async function run() {
    await mongoose.connect(uri);
    console.log('Connected to DB');

    const adminUser = await mongoose.model('User').findOne({ email: 'bharatproperties570@gmail.com' }).populate('role');
    
    if (!adminUser) {
        console.log('Admin user not found');
        process.exit(1);
    }

    const req = {
        query: {},
        user: adminUser
    };

    const res = {
        status: (code) => ({
            json: (data) => {
                console.log('Status Code:', code);
                console.log('Total Inventories:', data.total);
                console.log('Results Count:', data.data?.length);
                process.exit(0);
            }
        })
    };

    try {
        await getInventory(req, res);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

run();
