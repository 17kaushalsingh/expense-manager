import express, { Request, Response } from 'express';
import cors from 'cors';
import { config } from './config';

import accountRouter from './routes/account.routes';
import analyticsRouter from './routes/analytics.routes';
import authRouter from './routes/auth.routes';
import categoryRouter from './routes/category.routes';
import groupRouter from './routes/group.routes';
import settlementRouter from './routes/settlement.routes';
import splitRouter from './routes/split.routes';
import transactionRouter from './routes/transaction.routes';
import userRouter from './routes/user.routes';

export const app = express();

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/users', userRouter);
app.use('/api/accounts', accountRouter);
app.use('/api/categories', categoryRouter);
app.use('/api/transactions', transactionRouter);
app.use('/api/groups', groupRouter);
app.use('/api/splits', splitRouter);
app.use('/api/settlements', settlementRouter);
app.use('/api/analytics', analyticsRouter);

app.get('/api/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', message: 'Expense Manager Backend is running' });
});
