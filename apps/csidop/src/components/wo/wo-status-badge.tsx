const STATUS_STYLES: Record<string, string> = {
  Open: "bg-blue-100 text-blue-700",
  InProgress: "bg-amber-100 text-amber-700",
  PendingApproval: "bg-purple-100 text-purple-700",
  Closed: "bg-green-100 text-green-700",
  OnHold: "bg-gray-100 text-gray-500",
};

const STATUS_LABELS: Record<string, string> = {
  Open: "Open",
  InProgress: "In Progress",
  PendingApproval: "Pending Approval",
  Closed: "Closed",
  OnHold: "On Hold",
};

export default function WoStatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? "bg-gray-100 text-gray-500";
  const label = STATUS_LABELS[status] ?? status;
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>
      {label}
    </span>
  );
}
