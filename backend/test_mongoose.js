import dotenv from 'dotenv';
dotenv.config({path: '/Users/bharatproperties/.gemini/antigravity/scratch/bharat-properties-crm/backend/.env'});
import mongoose from 'mongoose';
import Inventory from './models/Inventory.js';

async function check() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://bharatproperties:Bharat%40570@ac-xav0cir-shard-00-00.7dehanz.mongodb.net:27017,ac-xav0cir-shard-00-01.7dehanz.mongodb.net:27017,ac-xav0cir-shard-00-02.7dehanz.mongodb.net:27017/bharatproperties1?ssl=true&replicaSet=atlas-145yac-shard-0&authSource=admin&retryWrites=true&w=majority');
  
  const inv = await Inventory.findOne({ _id: new mongoose.Types.ObjectId("69ab0c0181eb4c56747e884d") });
  console.log("Direct Mongoose Doc:");
  console.log("sizeId:", inv.sizeId);
  console.log("sizeConfig:", inv.sizeConfig);
  
  console.log("\nJSON Serialized (What API sends):");
  const json = inv.toJSON();
  console.log("sizeId:", json.sizeId);
  console.log("sizeConfig:", json.sizeConfig);
  
  process.exit(0);
}
check();
