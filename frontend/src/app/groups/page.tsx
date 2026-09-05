"use client";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { Users, Plus } from "lucide-react";
import { useGroups } from "@/hooks/useGroups";
import Link from "next/link";
import { useState } from "react";
import { CreateGroupModal } from "@/components/groups/CreateGroupModal";

export default function GroupsPage() {
  const { data: groups, isLoading } = useGroups();
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between pb-4 border-b border-border-soft">
        <h1 className="text-2xl font-bold tracking-tight">Your Groups</h1>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center bg-brand-primary text-white font-medium px-4 py-2 rounded-lg hover:bg-brand-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Group
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-4">
        {isLoading ? (
          <div className="text-text-secondary p-4">Loading groups...</div>
        ) : groups && groups.length > 0 ? (
          groups.map((group: any) => (
            <Link key={group.id} href={`/groups/${group.id}`}>
              <div className="bg-surface-primary border border-border-soft rounded-2xl p-5 hover:bg-surface-secondary transition-colors cursor-pointer shadow-sm h-full">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-lg text-text-primary">{group.name}</h3>
                  <div className="w-8 h-8 rounded-full bg-surface-secondary flex items-center justify-center border border-border-soft">
                    <Users className="w-4 h-4 text-text-secondary" />
                  </div>
                </div>
                <p className="text-sm text-text-secondary">{group.members?.length || 1} Members</p>
              </div>
            </Link>
          ))
        ) : (
          <div className="text-text-secondary p-4 border border-dashed border-border-soft rounded-xl text-center w-full col-span-full">
            No groups found. Create one to start splitting expenses!
          </div>
        )}
      </div>

      <CreateGroupModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </DashboardLayout>
  );
}
