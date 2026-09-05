interface NetBalance {
  userId: string;
  amount: number; // positive = creditor (gets money), negative = debtor (owes money)
}

export interface SimplifiedDebt {
  fromUserId: string;
  toUserId: string;
  amount: number;
}

export function simplifyDebts(balances: Record<string, number>): SimplifiedDebt[] {
  // Convert to array and filter out 0 balances
  const netBalances: NetBalance[] = Object.entries(balances)
    .filter(([_, amount]) => Math.abs(amount) > 0.01)
    .map(([userId, amount]) => ({ userId, amount }));

  // Sort so creditors (highest positive) are first, debtors (lowest negative) are last
  netBalances.sort((a, b) => b.amount - a.amount);

  let i = 0; // index of creditors
  let j = netBalances.length - 1; // index of debtors
  const transactions: SimplifiedDebt[] = [];

  while (i < j) {
    const creditor = netBalances[i];
    const debtor = netBalances[j];

    // Find the minimum to settle between the current creditor and debtor
    const settlementAmount = Math.min(creditor.amount, Math.abs(debtor.amount));

    if (settlementAmount > 0.01) {
      transactions.push({
        fromUserId: debtor.userId,
        toUserId: creditor.userId,
        amount: Number(settlementAmount.toFixed(2))
      });
    }

    // Adjust balances
    creditor.amount -= settlementAmount;
    debtor.amount += settlementAmount;

    // Move pointers if balance is settled
    if (Math.abs(creditor.amount) < 0.01) {
      i++;
    }
    if (Math.abs(debtor.amount) < 0.01) {
      j--;
    }
  }

  return transactions;
}
