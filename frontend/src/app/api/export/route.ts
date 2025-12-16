import { NextRequest, NextResponse } from 'next/server'
import { queryTimescale } from '@/lib/timescale'

export const dynamic = 'force-dynamic'

interface SensorReading {
  time: Date
  haystack_name: string
  dis: string
  value: number
  units: string
  quality: string
  metadata: Record<string, unknown>
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    // Parameters
    const format = searchParams.get('format') || 'csv'
    const timeRange = searchParams.get('range') || '24h'
    const haystackName = searchParams.get('haystack') || null
    const startTime = searchParams.get('start') || null
    const endTime = searchParams.get('end') || null

    // Build time filter
    let timeFilter = ''
    const params: (string | Date)[] = []
    let paramIndex = 1

    if (startTime && endTime) {
      timeFilter = `time >= $${paramIndex} AND time <= $${paramIndex + 1}`
      params.push(new Date(startTime), new Date(endTime))
      paramIndex += 2
    } else {
      const intervals: Record<string, string> = {
        '1h': '1 hour',
        '24h': '24 hours',
        '7d': '7 days',
        '30d': '30 days'
      }
      const interval = intervals[timeRange] || '24 hours'
      timeFilter = `time >= NOW() - INTERVAL '${interval}'`
    }

    // Build haystack filter
    let haystackFilter = ''
    if (haystackName) {
      haystackFilter = `AND haystack_name = $${paramIndex}`
      params.push(haystackName)
    }

    // Query data with dynamic metadata
    const sql = `
      SELECT
        time,
        haystack_name,
        dis,
        value,
        units,
        quality,
        metadata
      FROM sensor_readings
      WHERE ${timeFilter} ${haystackFilter}
      ORDER BY time DESC
      LIMIT 100000
    `

    const readings = await queryTimescale<SensorReading>(sql, params)

    if (format === 'json') {
      // Return JSON with flattened metadata
      const filename = `sensor_data_${new Date().toISOString().split('T')[0]}.json`

      // Flatten metadata into each reading for cleaner export
      const flattenedReadings = readings.map(reading => ({
        time: reading.time,
        haystack_name: reading.haystack_name,
        dis: reading.dis,
        value: reading.value,
        units: reading.units,
        quality: reading.quality,
        ...(reading.metadata || {})
      }))

      return new NextResponse(JSON.stringify(flattenedReadings, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="${filename}"`
        }
      })
    } else {
      // Return CSV with dynamic columns from metadata
      const filename = `sensor_data_${new Date().toISOString().split('T')[0]}.csv`

      // Collect all unique metadata keys across all readings
      const metadataKeys = new Set<string>()
      for (const reading of readings) {
        if (reading.metadata) {
          Object.keys(reading.metadata).forEach(key => metadataKeys.add(key))
        }
      }
      const sortedMetadataKeys = Array.from(metadataKeys).sort()

      // Build CSV headers: core fields + dynamic metadata fields
      const headers = [
        'time',
        'haystack_name',
        'display_name',
        'value',
        'units',
        'quality',
        ...sortedMetadataKeys
      ]

      // Build CSV content
      const csvRows = [headers.join(',')]

      for (const reading of readings) {
        const row = [
          new Date(reading.time).toISOString(),
          escapeCSV(reading.haystack_name),
          escapeCSV(reading.dis),
          reading.value,
          escapeCSV(reading.units),
          escapeCSV(reading.quality),
          ...sortedMetadataKeys.map(key => {
            const val = reading.metadata?.[key]
            return val !== undefined && val !== null ? escapeCSV(String(val)) : ''
          })
        ]
        csvRows.push(row.join(','))
      }

      const csvContent = csvRows.join('\n')

      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${filename}"`
        }
      })
    }
  } catch (error) {
    console.error('Export error:', error)
    return NextResponse.json(
      { error: 'Failed to export data' },
      { status: 500 }
    )
  }
}

// Helper to escape CSV values
function escapeCSV(value: string | null | undefined): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}
