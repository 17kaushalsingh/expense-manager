'use client';
import {useState} from 'react';
import {Modal,ErrorMessage} from '@/components/ui/Controls';
import {MemberPicker,Person} from './MemberPicker';
import {useAction} from '@/hooks/useResource';
import {apiClient} from '@/lib/api/client';
import {useFormat} from '@/lib/format';
export function CreateGroupModal({isOpen,onClose}:{isOpen:boolean;onClose:()=>void}){
 const [members,setMembers]=useState<Person[]>([]);const {currency}=useFormat();
 const action=useAction((name:string)=>apiClient.post('/groups',{name,memberIds:members.map(m=>m.id),currency}),onClose);
 if(!isOpen)return null;
 return <Modal title="New group" onClose={onClose}><form className="space-y-4" onSubmit={e=>{e.preventDefault();action.mutate(String(new FormData(e.currentTarget).get('name')));}}><label className="label">Group name<input className="field" name="name" required/></label><p className="text-sm text-text-secondary">Currency: {currency}. Members must use the same currency.</p><MemberPicker selected={members} onChange={setMembers}/><ErrorMessage error={action.error}/><button className="btn" disabled={action.isPending}>Create group</button></form></Modal>;
}
