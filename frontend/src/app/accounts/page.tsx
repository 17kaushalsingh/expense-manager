'use client';
import {useState} from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import {useAccounts} from '@/hooks/useDashboard';
import {useAction} from '@/hooks/useResource';
import {apiClient} from '@/lib/api/client';
import {Account} from '@/lib/types';
import {useFormat} from '@/lib/format';
import {AddAccountModal} from '@/components/accounts/AddAccountModal';
import {Confirm,ErrorMessage} from '@/components/ui/Controls';
export default function Accounts(){
 const accounts=useAccounts(),{money}=useFormat();const [edit,setEdit]=useState<Account|null|undefined>(),[remove,setRemove]=useState<Account>();
 const deletion=useAction(()=>apiClient.delete(`/accounts/${remove?.id}`),()=>setRemove(undefined));
 return <DashboardLayout><header className="flex justify-between items-center"><h1 className="text-2xl font-bold">Accounts Vault</h1><button className="btn" onClick={()=>setEdit(null)}>Add account</button></header><ErrorMessage error={accounts.error}/>{accounts.isLoading&&<p>Loading accounts…</p>}{accounts.data?.length===0&&<p className="panel">Create your first account to start recording transactions.</p>}<div className="grid sm:grid-cols-2 gap-4">{accounts.data?.map(a=><article className="panel space-y-4" key={a.id}><div><h2 className="font-semibold text-lg">{a.name}</h2><p className="text-xs text-text-secondary">{a.type.replaceAll('_',' ')}</p></div><p className="text-2xl font-bold tabular-nums">{money(a.balance,a.currency)}</p><div className="flex gap-2 flex-wrap"><Link className="btn-secondary" href={`/transactions?accountId=${a.id}`}>History</Link>{!a.isDefault&&!['ACCOUNTS_RECEIVABLE','ACCOUNTS_PAYABLE'].includes(a.type)&&<><button className="btn-secondary" onClick={()=>setEdit(a)}>Edit</button><button className="btn-secondary" onClick={()=>{deletion.reset();setRemove(a);}}>Delete</button></>}</div></article>)}</div>{edit!==undefined&&<AddAccountModal isOpen account={edit??undefined} onClose={()=>setEdit(undefined)}/>} {remove&&<Confirm message={`Delete ${remove.name}? Accounts with financial history cannot be deleted.`} onClose={()=>setRemove(undefined)} onConfirm={()=>deletion.mutate()} busy={deletion.isPending} error={deletion.error}/>}</DashboardLayout>;
}
