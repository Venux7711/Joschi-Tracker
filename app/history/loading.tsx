export default function HistoryLoading() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="h-14 bg-white border-b border-gray-100" />
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-3 animate-pulse">
        <div className="h-7 w-48 bg-gray-200 rounded-xl" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="h-10 bg-gray-50 border-b border-gray-100 px-4 flex items-center">
              <div className="h-4 w-24 bg-gray-200 rounded" />
            </div>
            <div className="p-4 space-y-2">
              <div className="h-3 w-full bg-gray-100 rounded" />
              <div className="h-3 w-3/4 bg-gray-100 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
