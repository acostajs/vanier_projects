import express from 'express';
import path from 'path';
import morgan from 'morgan';
import session from 'express-session';
import flash from 'connect-flash';
import helmet from 'helmet';
import { errorHandler } from './middleware/errorHandler'; 
import config from './config';
import routes from './routes'; 

const app = express();

// Middleware setup:
app.use(morgan('dev'));        
app.use(express.static(path.join(__dirname, '../public'))); 
app.use(express.urlencoded({ extended: false })); 
app.use(express.json());       
app.use(helmet());               
app.use(session({               
  secret: config.sessionSecret, 
  resave: false,
  saveUninitialized: false,
}));
app.use(flash());               

// Template engine setup (EJS):
app.set('views', path.join(__dirname, '../views'));
app.set('view engine', 'ejs');

// Mount Routes:
app.use('/', routes); 

// Error handling middleware (we'll define this later):
app.use(errorHandler);

export default app;