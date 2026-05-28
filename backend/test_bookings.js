import mongoose from 'mongoose';
mongoose.connect('mongodb://bharatproperties:Bharat%40570@ac-xav0cir-shard-00-00.7dehanz.mongodb.net:27017,ac-xav0cir-shard-00-01.7dehanz.mongodb.net:27017,ac-xav0cir-shard-00-02.7dehanz.mongodb.net:27017/bharatproperties1?ssl=true&replicaSet=atlas-145yac-shard-0&authSource=admin&retryWrites=true&w=majority').then(async () => {
    const Booking = mongoose.connection.db.collection('bookings');
    const b = await Booking.find().sort({bookingDate:-1, createdAt:-1}).limit(2).toArray();
    console.log("Found bookings:", b.map(x => x._id));
    process.exit();
});
