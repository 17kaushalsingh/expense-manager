import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: Number(process.env.PORT || 5000),
  jwtSecret: process.env.JWT_SECRET || 'super-secret-key-for-dev',
  corsOrigin: process.env.CORS_ORIGIN || '*',
};
