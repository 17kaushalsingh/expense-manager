"use client";

import { useState } from "react";
import { X, Check } from "lucide-react";
import { apiClient } from "@/lib/api/client";
import { useAuthStore } from "@/store/auth";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export function AddAccountModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("BANK_ACCOUNT");
  const [balance, setBalance] = useState("");
  
  const token = useAuthStore(state => state.token);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      return apiClient.post('/accounts', {
        name,
        type,
        currency: 'USD',
        balance: parseFloat(balance || '0')
      }, token || undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['netWorth'] });
      onClose();
      setName("");
      setBalance("");
      setType("BANK_ACCOUNT");
    }
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg-base/80 backdrop-blur-sm p-4">
      <div className="bg-surface-primary w-full max-w-md rounded-2xl border border-border-soft shadow-2xl overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-border-soft flex justify-between items-center bg-surface-primary">
          <h2 className="text-lg font-semibold text-text-primary">Add Account</h2>
          <button onClick={onClose} className="p-2 hover:bg-surface-secondary rounded-full transition-colors">
            <X className="w-5 h-5 text-text-secondary" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Account Name</label>
            <input 
              type="text" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Chase Checking"
              className="w-full bg-surface-secondary border border-border-soft rounded-xl px-4 py-3 text-text-primary outline-none focus:border-brand-primary transition-colors"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Account Type</label>
            <select 
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full bg-surface-secondary border border-border-soft rounded-xl px-4 py-3 text-text-primary outline-none focus:border-brand-primary transition-colors appearance-none"
            >
              <option value="BANK_ACCOUNT">Bank Account</option>
              <option value="CASH">Cash</option>
              <option value="CREDIT_CARD">Credit Card</option>
              <option value="DEBIT_CARD">Debit Card</option>
              <option value="INVESTMENT">Investment</option>
              <option value="LOAN">Loan</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Current Balance</label>
            <input 
              type="number" 
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              placeholder="0.00"
              className="w-full bg-surface-secondary border border-border-soft rounded-xl px-4 py-3 text-text-primary outline-none focus:border-brand-primary transition-colors"
            />
          </div>
        </div>

        <div className="p-4 border-t border-border-soft bg-surface-secondary/50">
          <button 
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !name}
            className="w-full bg-brand-primary text-white font-semibold py-3.5 rounded-xl hover:bg-brand-primary/90 disabled:opacity-50 transition-all flex justify-center items-center"
          >
            {mutation.isPending ? "Saving..." : <><Check className="w-5 h-5 mr-2" /> Add Account</>}
          </button>
        </div>
      </div>
    </div>
  );
}
