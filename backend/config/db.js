import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    // useNewUrlParser/useUnifiedTopology were dropped here: they have had no
    // effect since v4 of the MongoDB driver and only produced deprecation
    // warnings on startup.
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/nexvibe');
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`❌ MongoDB Error: ${error.message}`);
    process.exit(1);
  }
};

export default connectDB;
