import express, { Request, Response } from 'express';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

import authRouter from './routes/auth.routes';
import userRouter from './routes/user.routes';
import accountRouter from './routes/account.routes';

app.use('/api/auth', authRouter);
app.use('/api/users', userRouter);
app.use('/api/accounts', accountRouter);

app.get('/api/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', message: 'Expense Manager Backend is running' });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
