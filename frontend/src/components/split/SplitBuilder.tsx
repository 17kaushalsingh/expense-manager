"use client";

import { useState } from "react";
import { X, Check } from "lucide-react";

export function SplitBuilder({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const [splitMode, setSplitMode] = useState<'EQUAL' | 'EXACT' | 'PERCENTAGE' | 'SHARES'>('EQUAL');
  
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-bg-base/80 backdrop-blur-sm p-4 sm:p-0">
      <div className="bg-surface-primary w-full max-w-lg rounded-t-3xl sm:rounded-2xl border border-border-soft shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-border-soft flex justify-between items-center bg-surface-primary sticky top-0 z-10">
          <h2 className="text-lg font-semibold text-text-primary">New Split Expense</h2>
          <button onClick={onClose} className="p-2 hover:bg-surface-secondary rounded-full transition-colors">
            <X className="w-5 h-5 text-text-secondary" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* Amount Input */}
          <div className="text-center space-y-2">
            <p className="text-sm text-text-secondary uppercase tracking-wider font-medium">Total Amount</p>
            <div className="flex items-center justify-center text-5xl font-bold tabular-nums text-text-primary">
              <span className="text-text-secondary mr-1">$</span>
              <input 
                type="text" 
                placeholder="0.00" 
                className="bg-transparent border-none outline-none text-center w-48 focus:ring-0 p-0 placeholder:text-border-soft"
                autoFocus
              />
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-border-soft">
            <input 
              type="text" 
              placeholder="What was this for?" 
              className="w-full bg-surface-secondary border border-border-soft rounded-xl px-4 py-3 text-text-primary outline-none focus:border-brand-primary transition-colors"
            />
            
            <select className="w-full bg-surface-secondary border border-border-soft rounded-xl px-4 py-3 text-text-primary outline-none focus:border-brand-primary transition-colors appearance-none">
              <option value="">Paid by You (HDFC Bank)</option>
              <option value="">Paid by Alex</option>
              <option value="">Multiple Payers...</option>
            </select>
          </div>

          {/* Split Modes */}
          <div className="space-y-3 pt-4 border-t border-border-soft">
            <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Split Options</h3>
            <div className="flex p-1 bg-surface-secondary rounded-xl border border-border-soft overflow-x-auto hide-scrollbar">
              {['EQUAL', 'EXACT', 'PERCENTAGE', 'SHARES'].map((mode) => (
                <button 
                  key={mode}
                  onClick={() => setSplitMode(mode as any)}
                  className={`flex-1 py-2 px-3 text-xs font-medium rounded-lg whitespace-nowrap transition-all ${
                    splitMode === mode 
                      ? "bg-surface-primary text-brand-primary shadow-sm ring-1 ring-border-soft" 
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          {/* Members List (Mocked) */}
          <div className="space-y-2">
             <MemberSplitRow name="You" splitMode={splitMode} />
             <MemberSplitRow name="Alex" splitMode={splitMode} />
             <MemberSplitRow name="Sarah" splitMode={splitMode} />
             <MemberSplitRow name="Mike" splitMode={splitMode} />
          </div>
        </div>

        {/* Real-Time Math Guardrails Footer */}
        <div className="p-4 border-t border-border-soft bg-surface-secondary/50 backdrop-blur-md sticky bottom-0">
          <div className="flex items-center justify-between mb-4 px-2">
             <span className="text-sm text-text-secondary font-medium">Unallocated</span>
             <span className="text-sm font-bold text-positive tabular-nums">$0.00 left</span>
          </div>
          <button className="w-full bg-brand-primary text-white font-semibold py-3.5 rounded-xl hover:bg-brand-primary/90 active:scale-[0.98] transition-all flex justify-center items-center">
            <Check className="w-5 h-5 mr-2" />
            Save Split
          </button>
        </div>
        
      </div>
    </div>
  );
}

function MemberSplitRow({ name, splitMode }: { name: string, splitMode: string }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-xl hover:bg-surface-secondary transition-colors">
      <div className="flex items-center space-x-3">
        <div className="w-8 h-8 rounded-full bg-border-soft flex items-center justify-center font-medium text-xs text-text-primary">
          {name.charAt(0)}
        </div>
        <span className="font-medium text-text-primary text-sm">{name}</span>
      </div>
      <div className="flex items-center">
        {splitMode === 'EQUAL' && <span className="text-sm text-text-secondary tabular-nums">Auto</span>}
        {splitMode === 'PERCENTAGE' && (
           <div className="flex items-center border border-border-soft rounded-lg overflow-hidden bg-surface-primary">
             <input type="number" className="w-12 px-2 py-1 text-right text-sm outline-none bg-transparent" placeholder="0" />
             <span className="px-2 py-1 text-xs text-text-secondary bg-surface-secondary border-l border-border-soft">%</span>
           </div>
        )}
        {(splitMode === 'EXACT' || splitMode === 'SHARES') && (
           <input type="number" className="w-20 px-3 py-1.5 text-right text-sm border border-border-soft rounded-lg outline-none focus:border-brand-primary bg-surface-primary" placeholder="0.00" />
        )}
      </div>
    </div>
  );
}
