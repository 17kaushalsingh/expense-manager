-- AlterTable
ALTER TABLE "Account" ALTER COLUMN "balance" TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "Transaction" ALTER COLUMN "amount" TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "SplitExpense" ALTER COLUMN "totalAmount" TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "SplitPayer" ALTER COLUMN "amountPaid" TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "SplitParticipant" ALTER COLUMN "shareValue" TYPE DECIMAL(14,4),
ALTER COLUMN "amountOwed" TYPE DECIMAL(14,2);
