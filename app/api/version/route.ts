import { NextResponse } from 'next/server'
import { AKTUELLE_VERSION } from '@/lib/version'

// Niemals aus dem Cache: Der ganze Zweck ist zu erfahren, was gerade
// ausgeliefert wird.
export const dynamic = 'force-dynamic'
export const revalidate = 0

export function GET() {
  return NextResponse.json(
    { version: AKTUELLE_VERSION },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  )
}
