import { Sidebar } from "./Sidebar";
import { Home, CreditCard, Users, BarChart3 } from "lucide-react";
import Link from "next/link";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg-base text-text-primary flex flex-col md:flex-row">
      {/* Desktop Sidebar */}
      <Sidebar />
      
      {/* Main Content Area */}
      <main className="flex-1 md:ml-64 p-4 md:p-8 pb-24 md:pb-8">
        <div className="max-w-5xl mx-auto space-y-6">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t border-border-soft bg-surface-primary flex justify-around p-3 pb-safe">
        <MobileNavItem href="/" icon={<Home className="w-6 h-6" />} label="Home" />
        <MobileNavItem href="/accounts" icon={<CreditCard className="w-6 h-6" />} label="Accounts" />
        <MobileNavItem href="/groups" icon={<Users className="w-6 h-6" />} label="Groups" />
        <MobileNavItem href="/analytics" icon={<BarChart3 className="w-6 h-6" />} label="Analytics" />
      </nav>
    </div>
  );
}

function MobileNavItem({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link href={href} className="flex flex-col items-center text-text-secondary hover:text-brand-primary">
      {icon}
      <span className="text-[10px] mt-1 font-medium">{label}</span>
    </Link>
  );
}
