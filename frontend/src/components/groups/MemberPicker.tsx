'use client';
import {useState} from 'react';
import {apiClient} from '@/lib/api/client';
import {useAction} from '@/hooks/useResource';
import {ErrorMessage} from '@/components/ui/Controls';
export interface Person {id:string;name:string;}
export function MemberPicker({selected,onChange}:{selected:Person[];onChange:(people:Person[])=>void}){
 const [email,setEmail]=useState(''),[matches,setMatches]=useState<Person[]|null>(null);
 const search=useAction(async()=>{const people=await apiClient.get<Person[]>(`/users/lookup?email=${encodeURIComponent(email)}`);setMatches(people);});
 return <div className="space-y-3"><label className="label">Find a registered member by email<input className="field" type="email" value={email} onChange={e=>{setEmail(e.target.value);setMatches(null);}}/></label><button className="btn-secondary" type="button" disabled={!email||search.isPending} onClick={()=>search.mutate()}>Find member</button><ErrorMessage error={search.error}/>{matches?.length===0&&<p className="text-sm">No registered user found.</p>}{matches?.filter(p=>!selected.some(s=>s.id===p.id)).map(p=><button className="btn-secondary" key={p.id} type="button" onClick={()=>{onChange([...selected,p]);setMatches(null);setEmail('');}}>Add {p.name}</button>)}<div className="flex flex-wrap gap-2">{selected.map(p=><button key={p.id} className="btn-secondary text-sm" type="button" onClick={()=>onChange(selected.filter(s=>s.id!==p.id))}>{p.name} ×</button>)}</div></div>;
}
