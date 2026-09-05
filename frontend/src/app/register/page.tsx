"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { apiClient } from "@/lib/api/client";
import Link from "next/link";
import { ArrowRight, Loader2 } from "lucide-react";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  const router = useRouter();
  const setAuth = useAuthStore((state) => state.setAuth);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const data = await apiClient.post("/auth/register", { name, email, password });
      setAuth(data.token, data.user);
      router.push("/");
    } catch (err: any) {
      setError(err.message || "An error occurred during registration");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-base flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-surface-primary border border-border-soft rounded-2xl p-8 shadow-sm">
        
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-brand-primary mb-2">Ledger<span className="text-text-primary">Sync</span></h1>
          <p className="text-sm text-text-secondary">Create a new account to get started.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && <div className="p-3 text-sm text-negative bg-negative/10 rounded-lg">{error}</div>}
          
          <div className="space-y-1">
            <label className="text-sm font-medium text-text-secondary">Full Name</label>
            <input 
              type="text" 
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-surface-secondary border border-border-soft rounded-xl px-4 py-3 text-text-primary outline-none focus:border-brand-primary transition-colors"
              placeholder="Enter your full name"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-text-secondary">Email address</label>
            <input 
              type="email" 
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-surface-secondary border border-border-soft rounded-xl px-4 py-3 text-text-primary outline-none focus:border-brand-primary transition-colors"
              placeholder="Enter your email"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-text-secondary">Password</label>
            <input 
              type="password" 
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-surface-secondary border border-border-soft rounded-xl px-4 py-3 text-text-primary outline-none focus:border-brand-primary transition-colors"
              placeholder="Create a password"
            />
          </div>

          <button 
            type="submit" 
            disabled={isLoading}
            className="w-full bg-brand-primary text-white font-medium py-3.5 rounded-xl hover:bg-brand-primary/90 transition-colors flex items-center justify-center disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
              <>Sign Up <ArrowRight className="w-4 h-4 ml-2" /></>
            )}
          </button>
        </form>

        <p className="mt-8 text-center text-sm text-text-secondary">
          Already have an account?{' '}
          <Link href="/login" className="text-brand-primary hover:underline font-medium">
            Sign in
          </Link>
        </p>

      </div>
    </div>
  );
}
