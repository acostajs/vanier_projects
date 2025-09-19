import mongoose, { Schema, Document } from 'mongoose';
import { IEmployee } from './Employee';

export interface IPerformanceLog extends Document {
  employee: mongoose.Types.ObjectId | IEmployee; 
  log_date: Date;
  rating?: number;
  notes?: string;
  recorded_at?: Date; 
}

const PerformanceLogSchema: Schema = new Schema({
  employee: { 
    type: Schema.Types.ObjectId,
    ref: 'Employee',
    required: true,
    index: true
  },
  log_date: { 
    type: Date,
    required: true,
    index: true
  },
  rating: {
    type: Number,
    min: 1,
    max: 5
  },
  notes: {
    type: String,
    trim: true
  }
}, {
  timestamps: { createdAt: 'recorded_at', updatedAt: false }
});

export default mongoose.model<IPerformanceLog>('PerformanceLog', PerformanceLogSchema);