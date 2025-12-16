import { NextResponse } from 'next/server'
import { getUniqueHaystackNames, queryTimescale } from '@/lib/timescale'

export const dynamic = 'force-dynamic'

interface PointStats {
  haystack_name: string
  count: string
  first_time: Date
  last_time: Date
}

export async function GET() {
  try {
    // Get unique haystack names with stats
    const points = await queryTimescale<PointStats>(`
      SELECT
        haystack_name,
        COUNT(*) as count,
        MIN(time) as first_time,
        MAX(time) as last_time
      FROM sensor_readings
      WHERE haystack_name IS NOT NULL
      GROUP BY haystack_name
      ORDER BY haystack_name
    `)

    return NextResponse.json({
      points: points.map(p => ({
        name: p.haystack_name,
        count: parseInt(p.count),
        firstTime: p.first_time,
        lastTime: p.last_time
      }))
    })
  } catch (error) {
    console.error('Points API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch points' },
      { status: 500 }
    )
  }
}
