import { NextRequest, NextResponse } from 'next/server'
import { queryTimescale } from '@/lib/timescale'

export const dynamic = 'force-dynamic'

interface DeleteRequest {
  type: 'points' | 'time_range' | 'all'
  haystack_names?: string[]
  from?: string
  to?: string
}

// GET - Preview delete count
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') as DeleteRequest['type']
    const haystackNames = searchParams.get('haystack_names')?.split(',').filter(Boolean)
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    let sql = ''
    const params: (string | Date)[] = []

    if (type === 'points' && haystackNames?.length) {
      const placeholders = haystackNames.map((_, i) => `$${i + 1}`).join(', ')
      sql = `SELECT COUNT(*) as count FROM sensor_readings WHERE haystack_name IN (${placeholders})`
      params.push(...haystackNames)
    } else if (type === 'time_range' && from && to) {
      sql = `SELECT COUNT(*) as count FROM sensor_readings WHERE time >= $1 AND time <= $2`
      params.push(new Date(from), new Date(to))
    } else if (type === 'all') {
      sql = `SELECT COUNT(*) as count FROM sensor_readings`
    } else {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })
    }

    const result = await queryTimescale<{ count: string }>(sql, params)
    const count = parseInt(result[0]?.count || '0')

    return NextResponse.json({ count })
  } catch (error) {
    console.error('Delete preview error:', error)
    return NextResponse.json(
      { error: 'Failed to preview delete' },
      { status: 500 }
    )
  }
}

// DELETE - Execute deletion
export async function DELETE(request: NextRequest) {
  try {
    const body: DeleteRequest = await request.json()
    const { type, haystack_names, from, to } = body

    let sql = ''
    const params: (string | Date)[] = []

    if (type === 'points' && haystack_names?.length) {
      const placeholders = haystack_names.map((_, i) => `$${i + 1}`).join(', ')
      sql = `DELETE FROM sensor_readings WHERE haystack_name IN (${placeholders})`
      params.push(...haystack_names)
    } else if (type === 'time_range' && from && to) {
      sql = `DELETE FROM sensor_readings WHERE time >= $1 AND time <= $2`
      params.push(new Date(from), new Date(to))
    } else if (type === 'all') {
      sql = `TRUNCATE TABLE sensor_readings`
    } else {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })
    }

    await queryTimescale(sql, type === 'all' ? [] : params)

    return NextResponse.json({ success: true, message: 'Data deleted successfully' })
  } catch (error) {
    console.error('Delete error:', error)
    return NextResponse.json(
      { error: 'Failed to delete data' },
      { status: 500 }
    )
  }
}
