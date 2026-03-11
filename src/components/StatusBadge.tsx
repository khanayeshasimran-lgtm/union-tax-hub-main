const statusConfig: Record<string, string> = {
  New: "status-new",
  "Not Answered": "status-not-answered",
  "Follow-Up": "status-follow-up",
  Converted: "status-converted",
  Closed: "status-closed",
  "Not Interested": "status-not-interested",
  "Other Firm": "status-not-interested",
  "Wrong Number": "status-closed",
  Upcoming: "status-new",
  Completed: "status-converted",
  Overdue: "status-not-answered",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`status-badge ${statusConfig[status] || "status-closed"}`}>
      {status}
    </span>
  );
}
