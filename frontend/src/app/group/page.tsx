"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import GroupDetails from "@/components/groups/GroupDetails";
function Details() {
  const id = useSearchParams().get("groupId");
  return id && /^[0-9a-f-]{36}$/i.test(id) ? (
    <GroupDetails id={id} />
  ) : (
    <p>Select a group from Shared expenses.</p>
  );
}
export default function Page() {
  return (
    <Suspense fallback={<p>Loading group…</p>}>
      <Details />
    </Suspense>
  );
}
