const COLORS: Record<string, string> = {
  Pending: 'bg-yellow-50 text-yellow-700',
  'Under Review': 'bg-blue-50 text-blue-700',
  'Agent Assigned': 'bg-indigo-50 text-indigo-700',
  'Verification In Progress': 'bg-purple-50 text-purple-700',
  'Verification Submitted': 'bg-cyan-50 text-cyan-700',
  Approved: 'bg-green-50 text-green-700',
  Rejected: 'bg-red-50 text-red-700',
  Converted: 'bg-gray-100 text-gray-600',
  Active: 'bg-green-50 text-green-700',
  Completed: 'bg-gray-100 text-gray-600',
  Overdue: 'bg-red-50 text-red-700',
  Paid: 'bg-green-50 text-green-700',
}

export default function StatusPill({ status }: { status: string }) {
  const cls = COLORS[status] || 'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {status}
    </span>
  )
}
