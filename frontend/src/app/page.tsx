"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Database,
  Wifi,
  WifiOff,
  RefreshCw,
  Clock,
  BarChart3,
  Calendar,
  Shield,
  ShieldOff,
  Hash
} from "lucide-react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"

interface DashboardData {
  mqtt: {
    broker: string
    port: number
    connectionStatus: string
    lastConnected: string | null
    tlsEnabled: boolean
    enabled: boolean
    topicPatterns: string[]
  }
  timescale: {
    connected: boolean
    totalReadings: number
    todayReadings: number
    lastDataTime: string | null
  }
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)

  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true)
    try {
      const response = await fetch('/api/dashboard/summary')
      if (!response.ok) throw new Error('Failed to fetch data')
      const result = await response.json()
      setData(result)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData(true)
  }, [fetchData])

  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(() => fetchData(false), 10000)
    return () => clearInterval(interval)
  }, [autoRefresh, fetchData])

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat().format(num)
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never'
    const date = new Date(dateStr)
    return date.toLocaleString()
  }

  if (loading && !data) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    )
  }

  const mqttStatus = data?.mqtt.connectionStatus || 'disconnected'
  const mqttConnected = mqttStatus === 'connected'
  const mqttConnecting = mqttStatus === 'connecting'

  return (
    <div className="container mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">MQTT to TimescaleDB data collection status</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 px-3 py-2 bg-card rounded-lg border border-border">
            <Checkbox
              id="autoRefresh"
              checked={autoRefresh}
              onCheckedChange={(checked) => setAutoRefresh(checked === true)}
            />
            <Label htmlFor="autoRefresh" className="cursor-pointer text-sm">
              Auto-refresh
            </Label>
          </div>
          <Button onClick={() => fetchData(true)}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border-2 border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        {/* MQTT Connection Status */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-muted-foreground">MQTT Broker</h3>
              {mqttConnected ? (
                <Wifi className="w-5 h-5 text-emerald-500" />
              ) : mqttConnecting ? (
                <Wifi className="w-5 h-5 text-amber-500 animate-pulse" />
              ) : (
                <WifiOff className="w-5 h-5 text-red-500" />
              )}
            </div>
            <div className="flex items-center gap-2 mb-2">
              <span className={`w-3 h-3 rounded-full ${
                mqttConnected ? 'bg-emerald-500' :
                mqttConnecting ? 'bg-amber-500 animate-pulse' :
                'bg-red-500'
              }`} />
              <span className="text-lg font-semibold capitalize">
                {mqttStatus}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {data?.mqtt.broker ? `${data.mqtt.broker}:${data.mqtt.port}` : 'Not configured'}
            </p>
          </CardContent>
        </Card>

        {/* TimescaleDB Status */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-muted-foreground">TimescaleDB</h3>
              <Database className={`w-5 h-5 ${data?.timescale.connected ? 'text-emerald-500' : 'text-red-500'}`} />
            </div>
            <div className="flex items-center gap-2 mb-2">
              <span className={`w-3 h-3 rounded-full ${data?.timescale.connected ? 'bg-emerald-500' : 'bg-red-500'}`} />
              <span className="text-lg font-semibold">
                {data?.timescale.connected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">Time-series storage</p>
          </CardContent>
        </Card>

        {/* Total Readings */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-muted-foreground">Total Readings</h3>
              <BarChart3 className="w-5 h-5 text-blue-500" />
            </div>
            <p className="text-2xl font-bold text-foreground">
              {formatNumber(data?.timescale.totalReadings || 0)}
            </p>
            <p className="text-sm text-muted-foreground">All time</p>
          </CardContent>
        </Card>

        {/* Today's Readings */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-muted-foreground">Today&apos;s Readings</h3>
              <Calendar className="w-5 h-5 text-purple-500" />
            </div>
            <p className="text-2xl font-bold text-foreground">
              {formatNumber(data?.timescale.todayReadings || 0)}
            </p>
            <p className="text-sm text-muted-foreground">Since midnight</p>
          </CardContent>
        </Card>
      </div>

      {/* Detail Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* MQTT Configuration */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle>MQTT Configuration</CardTitle>
              <Link
                href="/settings"
                className="text-sm text-primary hover:text-primary/80 font-medium"
              >
                Configure
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="border-2 border-border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between py-3 px-4 bg-muted">
                <span className="text-muted-foreground">Broker</span>
                <span className="font-medium">
                  {data?.mqtt.broker || 'Not configured'}
                </span>
              </div>
              <div className="flex items-center justify-between py-3 px-4 border-t border-border">
                <span className="text-muted-foreground">Port</span>
                <span className="font-medium">{data?.mqtt.port}</span>
              </div>
              <div className="flex items-center justify-between py-3 px-4 bg-muted border-t border-border">
                <span className="text-muted-foreground">TLS/SSL</span>
                <span className="flex items-center gap-2">
                  {data?.mqtt.tlsEnabled ? (
                    <>
                      <Shield className="w-4 h-4 text-emerald-500" />
                      <span className="text-primary font-medium">Enabled</span>
                    </>
                  ) : (
                    <>
                      <ShieldOff className="w-4 h-4 text-slate-400" />
                      <span className="text-muted-foreground">Disabled</span>
                    </>
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between py-3 px-4 border-t border-border">
                <span className="text-muted-foreground">Enabled</span>
                <span className={`font-medium ${data?.mqtt.enabled ? 'text-primary' : 'text-muted-foreground'}`}>
                  {data?.mqtt.enabled ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="flex items-center justify-between py-3 px-4 bg-muted border-t border-border">
                <span className="text-muted-foreground">Last Connected</span>
                <span className="text-sm text-muted-foreground">
                  {formatDate(data?.mqtt.lastConnected || null)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Topic Subscriptions */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle>Topic Subscriptions</CardTitle>
              <Hash className="w-5 h-5 text-slate-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="border-2 border-border rounded-lg overflow-hidden">
              {data?.mqtt.topicPatterns?.length ? (
                data.mqtt.topicPatterns.map((pattern, index) => (
                  <div
                    key={index}
                    className={`flex items-center gap-2 py-3 px-4 ${
                      index % 2 === 0 ? 'bg-muted' : 'bg-card'
                    } ${index > 0 ? 'border-t border-border' : ''}`}
                  >
                    <code className="text-sm text-foreground font-mono">
                      {pattern}
                    </code>
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground text-sm py-6 px-4 text-center bg-muted">
                  No topics configured
                </p>
              )}
            </div>

            <div className="mt-4 pt-4 border-t-2 border-border">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Last Data Received</span>
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="w-4 h-4" />
                  {formatDate(data?.timescale.lastDataTime || null)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card className="mt-6">
        <CardHeader className="pb-4">
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <Button variant="secondary" asChild>
              <Link href="/monitoring">
                <BarChart3 className="w-4 h-4" />
                View Data
              </Link>
            </Button>
            <Button variant="secondary" asChild>
              <Link href="/settings">
                <Wifi className="w-4 h-4" />
                Configure MQTT
              </Link>
            </Button>
            <Button variant="secondary" asChild>
              <Link href="/api/export?format=csv" target="_blank">
                <Database className="w-4 h-4" />
                Export CSV
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
