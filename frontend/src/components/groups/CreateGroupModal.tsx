"use client";

import { useState } from "react";
import { X, Check } from "lucide-react";
import { apiClient } from "@/lib/api/client";
import { useAuthStore } from "@/store/auth";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export function CreateGroupModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const [name, setName] = useState("");
  
  const token = useAuthStore(state => state.token);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      return apiClient.post('/groups', {
        name,
        members: [] // Add members feature can be added later
      }, token || undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      onClose();
      setName("");
    }
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg-base/80 backdrop-blur-sm p-4">
      <div className="bg-surface-primary w-full max-w-md rounded-2xl border border-border-soft shadow-2xl overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-border-soft flex justify-between items-center bg-surface-primary">
          <h2 className="text-lg font-semibold text-text-primary">New Group</h2>
          <button onClick={onClose} className="p-2 hover:bg-surface-secondary rounded-full transition-colors">
            <X className="w-5 h-5 text-text-secondary" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Group Name</label>
            <input 
              type="text" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Goa Trip 2024"
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
            {mutation.isPending ? "Creating..." : <><Check className="w-5 h-5 mr-2" /> Create Group</>}
          </button>
        </div>
      </div>
    </div>
  );
}
