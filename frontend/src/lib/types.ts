export interface Profile {
  id: string;
  name: string;
  email?: string;
  displayCurrency?: string;
  timezone?: string;
}
export interface Account {
  id: string;
  name: string;
  type: string;
  currency: string;
  balance: number;
  isDefault: boolean;
}
export interface Category {
  id: string;
  name: string;
  type: "INCOME" | "EXPENSE" | "TRANSFER";
  userId: string | null;
}
export interface Transaction {
  id: string;
  accountId: string;
  categoryId: string | null;
  type: "INCOME" | "EXPENSE" | "TRANSFER";
  amount: number;
  balanceDelta: number;
  analyticsAmount: number;
  sourceType: string;
  dateTime: string;
  notes?: string;
  account?: Account;
  category?: Category;
}
export interface Member {
  userId: string;
  user?: { id: string; name: string };
}
export interface Group {
  id: string;
  name: string;
  currency: string;
  ownerId: string;
  members: Member[];
}
export interface Split {
  id: string;
  groupId: string | null;
  creatorId: string;
  description: string;
  currency: string;
  totalAmount: number;
  splitType: "EQUAL" | "EXACT" | "PERCENTAGE" | "SHARES";
  date: string;
  categoryId?: string;
  payers: { userId: string; amountPaid: number; accountId?: string }[];
  participants: { userId: string; shareValue?: number; amountOwed: number }[];
}
export interface Debt {
  fromUserId: string;
  toUserId: string;
  amount: number;
}
export interface DebtGraph {
  groupBalances: Record<string, number>;
  simplifiedTransactions: Debt[];
}
export interface Reminder {
  id: string;
  title: string;
  description?: string;
  type: string;
  dueDate: string;
  isRead: boolean;
  isCompleted: boolean;
}
