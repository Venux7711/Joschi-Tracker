export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="h-14 bg-white border-b border-gray-100" />
      <div className="max-w-2xl mx-auto px-4 py-5 space-y-5 animate-pulse">
        {/* Hero */}
        <div className="bg-amber-400 rounded-3xl h-28" />
        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl h-20 border border-gray-100" />
          ))}
        </div>
        {/* Trend */}
        <div className="bg-white rounded-2xl h-28 border border-gray-100" />
        {/* Cards */}
        <div className="bg-white rounded-2xl h-32 border border-gray-100" />
        <div className="bg-white rounded-2xl h-32 border border-gray-100" />
      </div>
    </div>
  )
}
