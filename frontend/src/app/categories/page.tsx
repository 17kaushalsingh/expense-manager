'use client';
import {useState} from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import {useResource,useAction} from '@/hooks/useResource';
import {apiClient} from '@/lib/api/client';
import {Category} from '@/lib/types';
import {Modal,Confirm,ErrorMessage} from '@/components/ui/Controls';
export default function Categories(){
 const categories=useResource<Category[]>('/categories');const [edit,setEdit]=useState<Category|null|undefined>(),[remove,setRemove]=useState<Category>();
 const deletion=useAction(()=>apiClient.delete(`/categories/${remove?.id}`),()=>setRemove(undefined));
 return <DashboardLayout><header className="flex justify-between"><h1 className="text-2xl font-bold">Categories</h1><button className="btn" onClick={()=>setEdit(null)}>New category</button></header><ErrorMessage error={categories.error}/>{categories.isLoading&&<p>Loading categories…</p>}<div className="space-y-3">{categories.data?.map(c=><article className="panel flex justify-between items-center" key={c.id}><div><h2>{c.name}</h2><p className="text-xs text-text-secondary">{c.type}{!c.userId?' · System default':''}</p></div>{c.userId&&<div className="flex gap-2"><button className="btn-secondary" onClick={()=>setEdit(c)}>Edit</button><button className="btn-secondary" onClick={()=>{deletion.reset();setRemove(c);}}>Delete</button></div>}</article>)}</div>{edit!==undefined&&<CategoryEditor category={edit??undefined} onClose={()=>setEdit(undefined)}/>} {remove&&<Confirm message={`Delete ${remove.name}? Historical transactions will become uncategorized.`} onClose={()=>setRemove(undefined)} onConfirm={()=>deletion.mutate()} busy={deletion.isPending} error={deletion.error}/>}</DashboardLayout>;
}
function CategoryEditor({category,onClose}:{category?:Category;onClose:()=>void}){
 const action=useAction((body:Record<string,unknown>)=>category?apiClient.put(`/categories/${category.id}`,body):apiClient.post('/categories',body),onClose);
 return <Modal title={category?'Edit category':'New category'} onClose={onClose}><form className="space-y-4" onSubmit={e=>{e.preventDefault();action.mutate(Object.fromEntries(new FormData(e.currentTarget)));}}><label className="label">Name<input className="field" name="name" defaultValue={category?.name} required/></label><label className="label">Type<select className="field" name="type" defaultValue={category?.type}><option>EXPENSE</option><option>INCOME</option><option>TRANSFER</option></select></label><ErrorMessage error={action.error}/><button className="btn" disabled={action.isPending}>Save category</button></form></Modal>;
}
