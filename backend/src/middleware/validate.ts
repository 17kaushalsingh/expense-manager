import { NextFunction, Response } from 'express';
import { ZodError, ZodType } from 'zod';
import { AuthRequest } from './auth';

export function validateBody<T>(schema: ZodType<T>) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          error: 'Invalid request body',
          issues: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        });
        return;
      }

      next(error);
    }
  };
}
