import {describe,it,expect} from "vitest";
import {blankWorkspace} from "../../../frontend/src/lib/device/vault";
import {queueCommand,ledgerSummary} from "../../../frontend/src/lib/device/ledger";
function ledger(){const w=blankWorkspace("Ledger","USD","UTC");w.tables.accounts=[{id:"cash",currency:"USD",type:"CASH",balance:100},{id:"card",currency:"USD",type:"CREDIT_CARD",balance:20}];return w;}
const input={accountId:"cash",type:"EXPENSE",amount:12.34,dateTime:"2026-11-11T12:00:00Z"};
describe("offline accounting projection",()=>{
 it("records, edits and reverses personal expenses exactly",()=>{const w=ledger(),c=queueCommand(w,"TX_CREATE",input);expect(w.tables.accounts[0].balance).toBe(87.66);expect(ledgerSummary(w).expense).toBe(12.34);queueCommand(w,"TX_UPDATE",{...input,amount:20},c.id);expect(w.tables.accounts[0].balance).toBe(80);expect(w.tables.transactions).toHaveLength(1);queueCommand(w,"TX_DELETE",{},c.id);expect(w.tables.accounts[0].balance).toBe(100);expect(ledgerSummary(w).expense).toBe(0);});
 it("keeps transfers out of analytics and handles credit-card signs",()=>{const w=ledger();queueCommand(w,"TRANSFER",{sourceAccountId:"cash",targetAccountId:"card",amount:10,dateTime:input.dateTime});expect(w.tables.accounts.map(a=>a.balance)).toEqual([90,10]);expect(ledgerSummary(w)).toEqual({net:80,income:0,expense:0});});
 it("preserves original foreign amounts and rounds accounting values",()=>{const w=ledger();queueCommand(w,"CONVERSION_CREATE",{...input,originalAmount:10,originalCurrency:"EUR",exchangeRate:1.2345,rateDate:"2026-11-10",rateSource:"MANUAL"});expect(w.tables.accounts[0].balance).toBe(87.65);expect(w.tables.currency_conversions[0].original_amount).toBe(10);expect(ledgerSummary(w).expense).toBe(12.35);});
 it("queues shared operations without inventing balances",()=>{const w=ledger();w.mode="CLOUD";w.ownerId=w.profile.id;queueCommand(w,"SPLIT_CREATE",{description:"Offline dinner"});expect(w.commands).toHaveLength(1);expect(w.tables.transactions).toHaveLength(0);expect(w.tables.accounts[0].balance).toBe(100);});
 it("denies system account edits and generated-entry manual deletion",()=>{const w=ledger();queueCommand(w,"TRANSFER",{sourceAccountId:"cash",targetAccountId:"card",amount:10,dateTime:input.dateTime});expect(()=>queueCommand(w,"TX_DELETE",{},String(w.tables.transactions[0].id))).toThrow("source");});
});
