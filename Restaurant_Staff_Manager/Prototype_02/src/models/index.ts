import mongoose from 'mongoose';
import config from '../config';

export const connectDB = async (): Promise<void> => {
  if (!config.mongoUri) {
    console.error('FATAL ERROR: MONGO_URI is not defined in environment variables.');
    process.exit(1);
  }
  console.log('>>> Entered connectDB function'); 
  console.log('>>> MONGO_URI found:', config.mongoUri.replace(/:([^:@]+)@/, ':<password_hidden>@'));
  try {
    console.log('>>> Attempting mongoose.connect...');
    await mongoose.connect(config.mongoUri);
    console.log('>>> mongoose.connect SUCCEEDED');
    console.log('MongoDB Connected Successfully');
  } catch (error: any) {
    console.error('>>> mongoose.connect FAILED');
    console.error('MongoDB Connection Error:', error.message);
    process.exit(1);
  }
  mongoose.connection.on('disconnected', () => {
    console.log('MongoDB disconnected.');
  });
};

export { default as Employee } from './Employee';
export { default as Shift } from './Shift';
export { default as PerformanceLog } from './PerformanceLog';
