import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') }); 

const config = {
  port: process.env.PORT || 3000,   
  sessionSecret: process.env.SESSION_SECRET || 'local-dev-secret-replace-me!',        
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/prototype_02',
  emailServiceProvider: process.env.EMAIL_SERVICE_PROVIDER, 
  emailService: process.env.EMAIL_SERVICE,         
  emailHost: process.env.EMAIL_HOST,               
  emailPort: parseInt(process.env.EMAIL_PORT || '587', 10),
  emailSecure: process.env.EMAIL_SECURE === 'true', 
  emailUser: process.env.EMAIL_USER || '',          
  emailPass: process.env.EMAIL_PASS || '',          
  emailFrom: process.env.EMAIL_FROM || '"No Reply" <noreply@example.com>'
};

if (!config.emailUser || !config.emailPass || !config.emailFrom.includes('@')) {
  if(!config.emailService) {
     if(!config.emailHost) {
          console.warn('!!! WARNING: Email configuration missing or incomplete in .env file. Email sending may fail.');
     }
  } else if (!config.emailHost) {
     console.log(`>>> Using email service name: ${config.emailService}`);
  }
}

export default config;