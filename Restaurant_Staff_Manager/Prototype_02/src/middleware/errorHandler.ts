import { Request, Response, NextFunction } from 'express';

export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error("Unhandled Error:", err.stack || err);

  const statusCode = res.statusCode && res.statusCode >= 400 ? res.statusCode : 500; 

  res.status(statusCode).json({
    message: err.message || 'An unexpected error occurred',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
};