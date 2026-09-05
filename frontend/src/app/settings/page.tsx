"use client";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { User, LogOut, Settings as SettingsIcon } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { useRouter } from "next/navigation";

export default function SettingsPage() {
  const { user, logout } = useAuthStore();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between pb-4 border-b border-border-soft">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-sm text-text-secondary mt-1">Manage your account and preferences</p>
        </div>
      </div>

      <div className="pt-6 max-w-2xl">
        <div className="bg-surface-primary border border-border-soft rounded-2xl p-6 shadow-sm mb-6">
          <div className="flex items-center space-x-4 mb-6 pb-6 border-b border-border-soft">
            <div className="w-16 h-16 rounded-full bg-surface-secondary flex items-center justify-center border border-border-soft">
              <User className="w-8 h-8 text-text-secondary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-text-primary">{user?.name || 'User'}</h2>
              <p className="text-sm text-text-secondary">{user?.email || 'email@example.com'}</p>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-medium text-text-secondary uppercase tracking-wider mb-4">Preferences</h3>
              
              <div className="flex items-center justify-between py-3 border-b border-border-soft">
                <div className="flex items-center space-x-3">
                  <SettingsIcon className="w-5 h-5 text-text-secondary" />
                  <div>
                    <p className="font-medium text-text-primary">Display Currency</p>
                    <p className="text-xs text-text-secondary">Used across all analytics and dashboards</p>
                  </div>
                </div>
                <select className="bg-surface-secondary border border-border-soft rounded-lg px-3 py-1.5 text-sm outline-none">
                  <option>USD ($)</option>
                  <option>EUR (€)</option>
                  <option>INR (₹)</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <button 
          onClick={handleLogout}
          className="flex items-center justify-center w-full bg-negative/10 text-negative font-medium py-3.5 rounded-xl hover:bg-negative/20 transition-colors"
        >
          <LogOut className="w-5 h-5 mr-2" />
          Sign Out
        </button>
      </div>
    </DashboardLayout>
  );
}
