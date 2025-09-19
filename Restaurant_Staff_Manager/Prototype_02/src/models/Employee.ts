import mongoose, { Schema, Document } from 'mongoose';

export interface IEmployee extends Document {
  name: string;
  position: string;
  email: string;
  hourly_rate?: number; 
}

// Mongoose Schema definition
const EmployeeSchema: Schema = new Schema({
  name: {
    type: String,
    required: [true, 'Employee name is required.'],
    trim: true, 
    index: true 
  },
  position: {
    type: String,
    required: [true, 'Position is required.'],
    trim: true,
    index: true
  },
  email: {
    type: String,
    required: [true, 'Email is required.'],
    unique: true, 
    lowercase: true, 
    trim: true,
    match: [/.+\@.+\..+/, 'Please fill a valid email address'], 
    index: true
  },
  hourly_rate: {
    type: Number,
    min: [0, 'Hourly rate cannot be negative.']
  }
}, {
  timestamps: true 
});

export default mongoose.model<IEmployee>('Employee', EmployeeSchema);