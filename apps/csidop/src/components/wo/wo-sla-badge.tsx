const SLA_STYLES: Record<string, string> = {
  OnTime: "bg-green-100 text-green-700",
  Warning: "bg-yellow-100 text-yellow-700",
  Breached: "bg-red-100 text-red-700",
};

export default function WoSlaBadge({
  slaStatus,
  slaDaysRemaining,
}: {
  slaStatus: string | null;
  slaDaysRemaining: number | null;
}) {
  if (!slaStatus || slaDaysRemaining === null) return null;

  const style = SLA_STYLES[slaStatus] ?? "bg-gray-100 text-gray-700";
  const label =
    slaDaysRemaining < 0
      ? `${Math.abs(slaDaysRemaining)}d overdue`
      : slaDaysRemaining === 0
        ? "Due today"
        : `${slaDaysRemaining}d left`;

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${style}`}
    >
      {label}
    </span>
  );
}
