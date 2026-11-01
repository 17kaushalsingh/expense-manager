export interface SimplifiedDebt { fromUserId: string; toUserId: string; amount: number; }
export function simplifyDebts(balances: Record<string,number>): SimplifiedDebt[] {
  const entries=Object.entries(balances).map(([userId,amount])=>({userId,cents:Math.round(amount*100)}));
  const debts: SimplifiedDebt[]=[];
  for(;;){
    const credit=entries.filter(e=>e.cents>0).sort((a,b)=>b.cents-a.cents||a.userId.localeCompare(b.userId))[0];
    const debit=entries.filter(e=>e.cents<0).sort((a,b)=>a.cents-b.cents||b.userId.localeCompare(a.userId))[0];
    if(!credit||!debit)break;
    const cents=Math.min(credit.cents,-debit.cents);
    debts.push({fromUserId:debit.userId,toUserId:credit.userId,amount:cents/100});
    credit.cents-=cents;debit.cents+=cents;
  }
  return debts;
}
