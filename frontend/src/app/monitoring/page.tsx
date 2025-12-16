"use client"

import { useState, useEffect, useCallback } from "react"
import {
  RefreshCw,
  Download,
  Clock,
  Filter,
  ChevronLeft,
  ChevronRight
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface SensorReading {
  time: string
  haystack_name: string
  dis: string
  value: number
  units: string
  device_id: string | null
  device_name: string | null
  quality: string
  metadata?: Record<string, unknown>
}

interface MonitoringData {
  readings: SensorReading[]
  pagination: {
    page: number
    limit: number
    totalCount: number
    totalPages: number
  }
  filters: {
    haystackNames: string[]
    timeRange: string
    haystackName: string | null
  }
}

export default function MonitoringPage() {
  const [data, setData] = useState<MonitoringData | null>(null)
  const [loading, setLoading] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('monitoring-autoRefresh') === 'true'
    }
    return false
  })

  // Filters
  const [page, setPage] = useState(1)
  const [timeRange, setTimeRange] = useState('1h')
  const [haystackFilter, setHaystackFilter] = useState('all')

  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true)
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '50',
        range: timeRange
      })

      if (haystackFilter && haystackFilter !== 'all') {
        params.set('haystack', haystackFilter)
      }

      const response = await fetch(`/api/monitoring?${params}`)
      if (!response.ok) throw new Error('Failed to fetch data')
      const result = await response.json()
      setData(result)
    } catch (error) {
      console.error('Failed to fetch monitoring data:', error)
    } finally {
      setLoading(false)
    }
  }, [page, timeRange, haystackFilter])

  useEffect(() => {
    fetchData(true)
  }, [fetchData])

  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(() => fetchData(false), 10000)
    return () => clearInterval(interval)
  }, [autoRefresh, fetchData])

  // Persist autoRefresh setting to localStorage
  useEffect(() => {
    localStorage.setItem('monitoring-autoRefresh', autoRefresh.toString())
  }, [autoRefresh])

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleString()
  }

  const formatValue = (value: number) => {
    if (value === null || value === undefined) return '-'
    return typeof value === 'number' ? value.toFixed(2) : value
  }

  return (
    <div className="container mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Monitoring</h1>
          <p className="text-muted-foreground">View collected sensor data</p>
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

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <Select
                value={timeRange}
                onValueChange={(value) => {
                  setTimeRange(value)
                  setPage(1)
                }}
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Time range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1h">Last 1 hour</SelectItem>
                  <SelectItem value="24h">Last 24 hours</SelectItem>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <Select
                value={haystackFilter}
                onValueChange={(value) => {
                  setHaystackFilter(value)
                  setPage(1)
                }}
              >
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="All points" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All points</SelectItem>
                  {data?.filters.haystackNames.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1" />

            <Button variant="secondary" asChild>
              <a href={`/api/export?format=csv&range=${timeRange}${haystackFilter && haystackFilter !== 'all' ? `&haystack=${haystackFilter}` : ''}`}>
                <Download className="w-4 h-4" />
                Export CSV
              </a>
            </Button>

            <Button variant="secondary" asChild>
              <a href={`/api/export?format=json&range=${timeRange}${haystackFilter && haystackFilter !== 'all' ? `&haystack=${haystackFilter}` : ''}`}>
                <Download className="w-4 h-4" />
                Export JSON
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Data Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-muted border-b-2 border-border">
                <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Time</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Haystack Name</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Display Name</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-foreground">Value</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Units</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Device</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-foreground">Quality</th>
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center">
                    <RefreshCw className="w-6 h-6 animate-spin text-primary mx-auto" />
                  </td>
                </tr>
              ) : data?.readings.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground bg-muted">
                    No data found for the selected filters
                  </td>
                </tr>
              ) : (
                data?.readings.map((reading, index) => (
                  <tr
                    key={index}
                    className={`border-b border-border hover:bg-muted ${
                      index % 2 === 0 ? 'bg-card' : 'bg-muted/50'
                    }`}
                  >
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {formatDate(reading.time)}
                    </td>
                    <td className="px-4 py-3">
                      <code className="text-sm text-foreground font-mono bg-muted px-2 py-0.5 rounded">
                        {reading.haystack_name || '-'}
                      </code>
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground">
                      {reading.dis || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-mono font-medium text-foreground">
                      {formatValue(reading.value)}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {reading.units || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {reading.device_name || (reading.device_id ? `Device ${reading.device_id}` : '-')}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full border ${
                        reading.quality === 'good'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : reading.quality === 'uncertain'
                          ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
                          : 'bg-red-50 text-red-700 border-red-200'
                      }`}>
                        {reading.quality || 'unknown'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t-2 border-border bg-muted">
            <div className="text-sm text-muted-foreground">
              Showing {((page - 1) * 50) + 1} to {Math.min(page * 50, data.pagination.totalCount)} of {data.pagination.totalCount} entries
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </Button>
              <span className="px-3 py-1 text-sm text-muted-foreground">
                Page {page} of {data.pagination.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(data.pagination.totalPages, p + 1))}
                disabled={page === data.pagination.totalPages}
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
