"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useAuthStore } from "@/store/auth";
import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { pendingInvitation, rememberInvitation, clearInvitation } from "@/lib/invitations";
import { ErrorMessage } from "@/components/ui/Controls";
interface Preview { valid: boolean; groupId: string; name: string; currency: string; status: string }
export default function Join() {
 const {token: access, ready} = useAuthStore();
 const token = useSyncExternalStore(() => () => {}, () => /^[a-f0-9]{64}$/.test(location.hash.slice(1)) ? location.hash.slice(1) : pendingInvitation(), () => null);
 const [preview,setPreview] = useState<Preview>();
 const lookup=useMutation({mutationFn:(value:string)=>apiClient.post<Preview>("/invitations/lookup",{token:value}),onSuccess:setPreview});
 const request=useMutation({mutationFn:()=>apiClient.post<Preview>("/invitations/request",{token}),onSuccess:setPreview});
 useEffect(()=>{const fragment=location.hash.slice(1); if (/^[a-f0-9]{64}$/.test(fragment)) { rememberInvitation(fragment); history.replaceState(null,"","/join"); }},[]);
 const lookupCall = lookup.mutate;
 useEffect(()=>{if(token && access) lookupCall(token);},[token,access,lookupCall]);
 return <main className="min-h-screen grid place-items-center p-4"><section className="panel w-full max-w-lg space-y-4"><h1 className="text-2xl font-bold">Group invitation</h1>
 {!ready ? <p>Loading your session…</p> : !access ? <><p>Sign in or create an account to request membership. The owner will approve your request.</p><Link className="btn inline-block" href="/login">Sign in</Link> <Link href="/register">Create account</Link></> : !token ? <p>Open your original invitation link to continue.</p> : lookup.isPending ? <p>Checking invitation…</p> : preview?.valid === false ? <p>This invitation has expired or was revoked. Ask the group owner for a new link.</p> : preview && <><h2 className="text-xl">{preview.name}</h2><p>Accounting currency: {preview.currency}</p><p>Status: {preview.status === "NONE" ? "Not requested" : preview.status.toLowerCase()}</p>
 {preview.status === "APPROVED" ? <Link className="btn inline-block" onClick={clearInvitation} href={`/groups/${preview.groupId}`}>Open group</Link> : <><button className="btn" disabled={request.isPending || preview.status === "PENDING"} onClick={()=>request.mutate()}>{preview.status === "PENDING" ? "Awaiting owner approval" : "Request to join"}</button><button className="btn-secondary" onClick={()=>lookup.mutate(token)}>Refresh status</button><p className="text-sm">Your currency must match the group before approval. <Link href="/settings">Review Settings</Link>.</p></>}</>}
 <ErrorMessage error={lookup.error || request.error}/><Link className="block" href="/">Back to dashboard</Link></section></main>;
}
