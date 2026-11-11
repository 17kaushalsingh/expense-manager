import GroupDetails from "@/components/groups/GroupDetails";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <GroupDetails id={id} />;
}
