import Link from "next/link";
import { Home, CreditCard, Users, BarChart3, Settings } from "lucide-react";

export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 w-64 border-r border-border-soft bg-surface-primary hidden md:flex flex-col">
      <div className="p-6">
        <h1 className="text-xl font-bold tracking-tight text-brand-primary">Ledger<span className="text-text-primary">Sync</span></h1>
      </div>
      
      <nav className="flex-1 px-4 space-y-2">
        <NavItem href="/" icon={<Home className="w-5 h-5" />} label="Home" active />
        <NavItem href="/accounts" icon={<CreditCard className="w-5 h-5" />} label="Accounts" />
        <NavItem href="/groups" icon={<Users className="w-5 h-5" />} label="Groups" />
        <NavItem href="/analytics" icon={<BarChart3 className="w-5 h-5" />} label="Analytics" />
      </nav>

      <div className="p-4 border-t border-border-soft">
        <NavItem href="/settings" icon={<Settings className="w-5 h-5" />} label="Settings" />
      </div>
    </aside>
  );
}

function NavItem({ href, icon, label, active = false }: { href: string; icon: React.ReactNode; label: string; active?: boolean }) {
  return (
    <Link 
      href={href}
      className={`flex items-center space-x-3 px-3 py-2 rounded-md transition-colors ${
        active 
          ? "bg-surface-secondary text-brand-primary font-medium" 
          : "text-text-secondary hover:bg-surface-secondary hover:text-text-primary"
      }`}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}
