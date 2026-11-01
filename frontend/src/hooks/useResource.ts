'use client';
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query';
import {useAuthStore} from '@/store/auth';
import {apiClient} from '@/lib/api/client';
export function useResource<T>(path:string,enabled=true){
 const {token,user}=useAuthStore();
 return useQuery({queryKey:[user?.id,path],queryFn:()=>apiClient.get<T>(path,token??undefined),enabled:!!token&&enabled});
}
export function useAction<T=unknown>(action:(value:T)=>Promise<unknown>,onSuccess?:()=>void){
 const queries=useQueryClient();
 return useMutation({mutationFn:action,onSuccess:async()=>{await queries.invalidateQueries();onSuccess?.();}});
}
