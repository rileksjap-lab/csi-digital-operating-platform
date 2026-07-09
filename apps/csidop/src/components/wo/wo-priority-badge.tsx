const PRIORITY_STYLES: Record<string, string> = {
  Low: "bg-gray-100 text-gray-600",
  Normal: "bg-blue-50 text-blue-600",
  High: "bg-amber-100 text-amber-700",
  Urgent: "bg-red-100 text-red-700",
};

export default function WoPriorityBadge({ priority }: { priority: string }) {
  const style = PRIORITY_STYLES[priority] ?? "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>
      {priority}
    </span>
  );
}
