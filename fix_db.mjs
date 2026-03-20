import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function fix() {
    await mongoose.connect(process.env.MONGODB_URI);
    const Project = mongoose.model('Project', new mongoose.Schema({}, { strict: false }));
    
    const placeholder = 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1200&q=80';
    
    // Fix projects where projectImages is empty or missing url/path
    const projects = await Project.find({ isPublished: true });
    let count = 0;
    
    for (const p of projects) {
        let needsFix = false;
        if (!p.projectImages || p.projectImages.length === 0) {
            needsFix = true;
        } else {
            const hasMedia = p.projectImages.some(img => img.url || img.path);
            if (!hasMedia) needsFix = true;
        }
        
        if (needsFix) {
            await Project.updateOne({ _id: p._id }, {
                $set: {
                    projectImages: [{
                        url: placeholder,
                        category: 'Main',
                        title: 'Professional Preview'
                    }]
                }
            });
            count++;
        }
    }
    
    console.log(`Successfully restored images for ${count} projects.`);
    process.exit(0);
}

fix().catch(err => {
    console.error(err);
    process.exit(1);
});
