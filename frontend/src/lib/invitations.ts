const key = "pending-group-invitation";
export function pendingInvitation() { return localStorage.getItem(key); }
export function rememberInvitation(token: string) { if (/^[a-f0-9]{64}$/.test(token)) localStorage.setItem(key, token); }
export function clearInvitation() { localStorage.removeItem(key); }
export function authDestination() { return pendingInvitation() ? "/join" : "/"; }
