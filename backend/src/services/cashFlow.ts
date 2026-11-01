import { decimal } from '../utils/money';
export interface FlowRow { type: string; analytics_amount: number | string; date_time: string; }
export function cashFlowSeries(rows: FlowRow[], timezone: string, monthly: boolean, from: Date, to: Date) {
  const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'});
  const key=(date:Date)=>{const parts=formatter.formatToParts(date);const part=(type:string)=>parts.find(p=>p.type===type)!.value;return `${part('year')}-${part('month')}${monthly?'':`-${part('day')}`}`;};
  const buckets=new Map<string,{date:string;income:number;expense:number}>();
  // Advance in UTC and include endpoint keys to handle timezone boundaries.
  const cursor=new Date(from);cursor.setUTCHours(12,0,0,0);
  if(monthly)cursor.setUTCDate(1);
  for(let i=0;cursor<=new Date(to.getTime()+86400000) && i<4000;i++) {
    const k=key(cursor);buckets.set(k,{date:k,income:0,expense:0});
    if(monthly)cursor.setUTCMonth(cursor.getUTCMonth()+1);else cursor.setUTCDate(cursor.getUTCDate()+1);
  }
  const start=key(from),end=key(to);
  for(const k of [start,end]) if(!buckets.has(k)) buckets.set(k,{date:k,income:0,expense:0});
  let income=decimal(0),expense=decimal(0);
  for(const row of rows) {
    if(row.type!=='INCOME'&&row.type!=='EXPENSE')continue;
    const k=key(new Date(row.date_time));const bucket=buckets.get(k)??{date:k,income:0,expense:0};const field=row.type==='INCOME'?'income':'expense';
    bucket[field]=decimal(bucket[field]).plus(row.analytics_amount).toNumber();buckets.set(k,bucket);
    if(field==='income')income=income.plus(row.analytics_amount);else expense=expense.plus(row.analytics_amount);
  }
  return {totalIncome:income.toNumber(),totalExpense:expense.toNumber(),cashFlow:income.minus(expense).toNumber(),series:[...buckets.values()].filter(b=>b.date>=start&&b.date<=end).sort((a,b)=>a.date.localeCompare(b.date))};
}
