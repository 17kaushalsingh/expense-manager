import {supabase} from '@/lib/supabase';
const base=process.env.NEXT_PUBLIC_API_URL||'http://localhost:5000/api';
export class ApiError extends Error { constructor(message:string,public status:number){super(message);} }
async function request<T>(method:string,endpoint:string,body?:unknown,token?:string):Promise<T>{
 let access=token;
 if(!endpoint.startsWith('/auth/')||token){const {data,error}=await supabase().auth.getSession();if(error)throw error;access=data.session?.access_token??token;}
 const run=()=>fetch(`${base}${endpoint}`,{method,headers:{'Content-Type':'application/json',...(access?{Authorization:`Bearer ${access}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 let res=await run();
 if(res.status===401&&access){const {data,error}=await supabase().auth.refreshSession();if(!error&&data.session){access=data.session.access_token;res=await run();}}
 if(!res.ok){const error=await res.json().catch(()=>({error:res.statusText}));throw new ApiError(error.error||'Request failed',res.status);}
 return res.status===204?null as T:res.json();
}
export const apiClient={
 get:<T=unknown>(endpoint:string,token?:string)=>request<T>('GET',endpoint,undefined,token),
 post:<T=unknown>(endpoint:string,body:unknown,token?:string)=>request<T>('POST',endpoint,body,token),
 put:<T=unknown>(endpoint:string,body:unknown,token?:string)=>request<T>('PUT',endpoint,body,token),
 patch:<T=unknown>(endpoint:string,body:unknown,token?:string)=>request<T>('PATCH',endpoint,body,token),
 delete:<T=unknown>(endpoint:string,token?:string)=>request<T>('DELETE',endpoint,undefined,token),
};
