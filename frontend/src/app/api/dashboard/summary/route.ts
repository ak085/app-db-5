import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  checkTimescaleConnection,
  getTotalReadings,
  getTodayReadings,
  getLastDataTime
} from '@/lib/timescale'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Get MQTT config and connection status using raw query for fresh data
    // This bypasses any connection pooling/caching issues between Prisma and psycopg2
    const mqttConfigResult = await prisma.$queryRaw<Array<{
      broker: string | null
      port: number | null
      connectionStatus: string | null
      lastConnected: Date | null
      tlsEnabled: boolean | null
      enabled: boolean | null
      topicPatterns: string[] | null
    }>>`SELECT broker, port, "connectionStatus", "lastConnected", "tlsEnabled", enabled, "topicPatterns" FROM "MqttConfig" WHERE id = 1 LIMIT 1`

    const mqttConfig = mqttConfigResult[0] || null

    // Check TimescaleDB connection
    const timescaleConnected = await checkTimescaleConnection()

    // Get statistics from TimescaleDB
    const totalReadings = await getTotalReadings()
    const todayReadings = await getTodayReadings()
    const lastDataTime = await getLastDataTime()

    return NextResponse.json({
      mqtt: {
        broker: mqttConfig?.broker || '',
        port: mqttConfig?.port || 1883,
        connectionStatus: mqttConfig?.connectionStatus || 'disconnected',
        lastConnected: mqttConfig?.lastConnected,
        tlsEnabled: mqttConfig?.tlsEnabled || false,
        enabled: mqttConfig?.enabled !== false,
        topicPatterns: mqttConfig?.topicPatterns || ['bacnet/#']
      },
      timescale: {
        connected: timescaleConnected,
        totalReadings,
        todayReadings,
        lastDataTime
      }
    })
  } catch (error) {
    console.error('Dashboard summary error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch dashboard data' },
      { status: 500 }
    )
  }
}
