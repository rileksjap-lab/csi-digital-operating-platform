const STATUS_STYLES: Record<string, string> = {
  Prospect: "bg-gray-100 text-gray-600",
  Qualified: "bg-blue-100 text-blue-700",
  InProgress: "bg-amber-100 text-amber-700",
  Submitted: "bg-purple-100 text-purple-700",
  Clarification: "bg-orange-100 text-orange-700",
  Won: "bg-green-100 text-green-700",
  Lost: "bg-red-100 text-red-700",
  Cancelled: "bg-gray-200 text-gray-500",
};

const STATUS_LABELS: Record<string, string> = {
  Prospect: "Prospect",
  Qualified: "Qualified",
  InProgress: "In Progress",
  Submitted: "Submitted",
  Clarification: "Clarification",
  Won: "Won",
  Lost: "Lost",
  Cancelled: "Cancelled",
};

export default function TenderStatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? "bg-gray-100 text-gray-500";
  const label = STATUS_LABELS[status] ?? status;
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${style}`}
    >
      {label}
    </span>
  );
}
