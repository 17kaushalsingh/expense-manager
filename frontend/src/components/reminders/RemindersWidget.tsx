"use client";

import { useState, useRef, useEffect } from "react";
import { Bell, Check, X, CreditCard, Users, AlertCircle } from "lucide-react";
import { useReminders, useCompleteReminder, useDismissReminder } from "@/hooks/useReminders";

export function RemindersWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const { data: reminders, isLoading } = useReminders();
  const { mutate: completeReminder } = useCompleteReminder();
  const { mutate: dismissReminder } = useDismissReminder();
  
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const activeReminders = reminders?.filter((r: any) => !r.isCompleted && !r.isRead) || [];

  const getIcon = (type: string) => {
    switch (type) {
      case 'CREDIT_CARD_BILL': return <CreditCard className="w-5 h-5 text-brand-primary" />;
      case 'DEBT_PENDING': return <Users className="w-5 h-5 text-negative" />;
      default: return <AlertCircle className="w-5 h-5 text-text-secondary" />;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 bg-surface-secondary text-text-primary rounded-lg hover:bg-border-soft transition-colors border border-border-soft relative"
      >
        <Bell className="w-5 h-5" />
        {activeReminders.length > 0 && (
          <span className="absolute top-0 right-0 -mt-1 -mr-1 flex h-4 w-4 items-center justify-center rounded-full bg-negative text-[9px] font-bold text-white ring-2 ring-surface-primary">
            {activeReminders.length}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-surface-primary border border-border-soft rounded-2xl shadow-2xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-border-soft bg-surface-secondary/50 flex justify-between items-center">
            <h3 className="font-semibold text-text-primary text-sm">Reminders</h3>
            <span className="text-xs font-medium text-text-secondary bg-surface-secondary px-2 py-0.5 rounded-full border border-border-soft">
              {activeReminders.length} New
            </span>
          </div>

          <div className="max-h-96 overflow-y-auto p-2">
            {isLoading ? (
              <div className="p-4 text-center text-text-secondary text-sm">Loading...</div>
            ) : activeReminders.length > 0 ? (
              activeReminders.map((reminder: any) => (
                <div key={reminder.id} className="p-3 mb-2 bg-surface-secondary/30 border border-border-soft rounded-xl hover:bg-surface-secondary/80 transition-colors group relative">
                  <div className="flex items-start space-x-3">
                    <div className="mt-1">{getIcon(reminder.type)}</div>
                    <div className="flex-1">
                      <h4 className="text-sm font-medium text-text-primary">{reminder.title}</h4>
                      {reminder.description && (
                        <p className="text-xs text-text-secondary mt-0.5 line-clamp-2">{reminder.description}</p>
                      )}
                      <p className="text-[10px] text-text-secondary font-medium uppercase tracking-wider mt-2">
                        Due: {new Date(reminder.dueDate).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  {/* Actions (visible on hover) */}
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col space-y-1">
                    <button 
                      onClick={() => completeReminder(reminder.id)}
                      className="p-1.5 bg-surface-primary hover:bg-positive/10 text-text-secondary hover:text-positive rounded-lg border border-border-soft transition-colors tooltip"
                      title="Mark as done"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => dismissReminder(reminder.id)}
                      className="p-1.5 bg-surface-primary hover:bg-negative/10 text-text-secondary hover:text-negative rounded-lg border border-border-soft transition-colors tooltip"
                      title="Dismiss"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-6 text-center">
                <Bell className="w-8 h-8 text-border-soft mx-auto mb-2" />
                <p className="text-sm text-text-secondary font-medium">All caught up!</p>
                <p className="text-xs text-text-secondary mt-1">No pending reminders.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
