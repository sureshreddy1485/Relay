require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const User = require('../models/User');
const { uploadToCloudinary } = require('../utils/cloudinaryUpload');

const updatePic = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected');
    
    const imagePath = 'C:\\Users\\sures\\.gemini\\antigravity\\brain\\837ae7ff-bfbf-4151-8ed3-e26de46fb2f2\\hippy_bot_avatar_1779360057849.png';
    const buffer = fs.readFileSync(imagePath);
    console.log('Uploading to Cloudinary...');
    
    const result = await uploadToCloudinary(buffer, 'profiles', 'image');
    console.log('Uploaded successfully! URL:', result.secure_url);
    
    const mica = await User.findOneAndUpdate(
      { username: 'mica_bot' },
      { profilePicture: result.secure_url },
      { new: true }
    );
    
    console.log('Mica profile picture updated!', mica.profilePicture);
    process.exit(0);
  } catch (e) {
    console.error('Error:', e);
    process.exit(1);
  }
};

updatePic();
