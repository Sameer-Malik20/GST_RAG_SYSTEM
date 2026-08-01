const mongoose = require('mongoose');

const connectDB = async () => {
  const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/gstgpt';
  try {
    const conn = await mongoose.connect(MONGO_URI);
    console.log(`🍃 [MongoDB] Local Database Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`⚠️ [MongoDB] Local Connection Warning: ${error.message}`);
    console.log('📌 Operating in high-resilience fallback mode.');
  }
};

module.exports = connectDB;
