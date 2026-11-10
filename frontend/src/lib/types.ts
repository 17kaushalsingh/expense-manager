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
  archived?: boolean;
  myBalance?: number;
  id: string;
  name: string;
  currency: string;
  ownerId: string;
  members: Member[];
}
export interface Split {
  itemization?: import("./itemization").Itemization | null;
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

export interface SplitInput {
  itemization?: import("./itemization").Itemization;
  groupId?: string | null;
  description: string;
  totalAmount: number | null;
  splitType: Split["splitType"];
  payers: { userId: string; amountPaid?: number; accountId?: string }[];
  participants: { userId: string; shareValue?: number }[];
  categoryId?: string | null;
  date?: string;
}
export interface SplitTemplate {
  id: string;
  groupId: string;
  creatorId: string;
  name: string;
  payload: SplitInput;
  needsCorrection: boolean;
}

export interface ExpenseSchedule {
  id: string;
  groupId: string;
  creatorId: string;
  templateId: string;
  frequency: "WEEKLY" | "MONTHLY" | "YEARLY";
  startDate: string;
  endDate: string | null;
  timezone: string;
  status: "ACTIVE" | "PAUSED" | "ARCHIVED";
}
export interface ExpenseDraft {
  id: string;
  groupId: string;
  scheduleId: string;
  dueDate: string;
  timezone: string;
  payload: SplitInput;
  needsCorrection: boolean;
  canManage: boolean;
  scheduleStatus: string;
}
