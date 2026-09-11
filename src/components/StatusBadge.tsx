import { cn } from "@/lib/utils";

export default function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    대기: "bg-gray-100 text-gray-600",
    진행중: "bg-blue-100 text-blue-700",
    완료: "bg-emerald-100 text-emerald-700",
    지연: "bg-red-100 text-red-700",
  };
  return (
    <span className={cn("text-xs px-2 py-1 rounded-full font-medium", map[status] ?? "bg-gray-100 text-gray-600")}>
      {status}
    </span>
  );
}
