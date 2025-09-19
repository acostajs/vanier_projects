import app from './app';
import config from './config';
import { connectDB } from './models';
import './services/notificationService';

const startServer = async () => {
  try {
    await connectDB();
    app.listen(config.port, () => {
      console.log(`Server listening on port ${config.port}`);
      console.log(`Access local app at: http://localhost:${config.port}`);
    });
  } catch (error: any) {
    console.error('Error during server startup:', error.message);
    process.exit(1); 
  }
};

startServer();