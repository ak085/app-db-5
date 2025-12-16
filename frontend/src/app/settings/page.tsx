"use client"

import { useState, useEffect, useRef } from "react"
import {
  Save,
  RefreshCw,
  Wifi,
  Shield,
  ShieldOff,
  Upload,
  Trash2,
  Plus,
  X,
  Hash,
  Database,
  AlertTriangle
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Alert,
  AlertDescription,
} from "@/components/ui/alert"

interface Settings {
  mqtt: {
    broker: string
    port: number
    clientId: string
    username: string
    password: string
    keepAlive: number
    tlsEnabled: boolean
    tlsInsecure: boolean
    caCertPath: string | null
    topicPatterns: string[]
    qos: number
    enabled: boolean
    connectionStatus: string
  }
  system: {
    retentionDays: number
  }
}

interface CertificateStatus {
  ca: {
    exists: boolean
    path: string | null
    filename: string | null
  }
}

interface Toast {
  message: string
  type: "success" | "error"
}

interface DataPoint {
  name: string
  count: number
  firstTime: string
  lastTime: string
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [initialSettings, setInitialSettings] = useState<Settings | null>(null)
  const [certStatus, setCertStatus] = useState<CertificateStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const [newTopic, setNewTopic] = useState("")

  // Data Management state
  const [dataPoints, setDataPoints] = useState<DataPoint[]>([])
  const [selectedPoints, setSelectedPoints] = useState<string[]>([])
  const [deleteFromDate, setDeleteFromDate] = useState("")
  const [deleteToDate, setDeleteToDate] = useState("")
  const [deleteAllConfirm, setDeleteAllConfirm] = useState("")
  const [deletePreviewCount, setDeletePreviewCount] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Check if there are unsaved changes
  const hasUnsavedChanges = settings && initialSettings &&
    JSON.stringify(settings) !== JSON.stringify(initialSettings)

  // Load settings
  async function loadSettings() {
    try {
      const response = await fetch('/api/settings')
      if (!response.ok) throw new Error('Failed to load settings')
      const data = await response.json()
      setSettings(data)
      setInitialSettings(JSON.parse(JSON.stringify(data)))
    } catch (error) {
      setToast({
        message: error instanceof Error ? error.message : 'Failed to load settings',
        type: 'error'
      })
    } finally {
      setLoading(false)
    }
  }

  // Load certificate status
  async function loadCertificateStatus() {
    try {
      const response = await fetch('/api/settings/certificates')
      if (!response.ok) throw new Error('Failed to load certificate status')
      const data = await response.json()
      setCertStatus(data.certificates)
    } catch (error) {
      console.error('Failed to load certificate status:', error)
    }
  }

  useEffect(() => {
    loadSettings()
    loadCertificateStatus()
  }, [])

  // Save settings
  async function saveSettings() {
    if (!settings) return

    setSaving(true)
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      })

      if (!response.ok) throw new Error('Failed to save settings')

      setInitialSettings(JSON.parse(JSON.stringify(settings)))
      setToast({ message: 'Settings saved successfully', type: 'success' })
    } catch (error) {
      setToast({
        message: error instanceof Error ? error.message : 'Failed to save settings',
        type: 'error'
      })
    } finally {
      setSaving(false)
    }
  }

  // Upload certificate
  async function uploadCertificate(file: File) {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('type', 'ca')

    try {
      const response = await fetch('/api/settings/certificates', {
        method: 'POST',
        body: formData
      })

      const data = await response.json()

      if (!response.ok) throw new Error(data.error || 'Failed to upload certificate')

      setToast({ message: 'Certificate uploaded successfully', type: 'success' })
      await loadCertificateStatus()

      if (data.path && settings) {
        setSettings(prev => prev ? {
          ...prev,
          mqtt: { ...prev.mqtt, caCertPath: data.path }
        } : null)
      }
    } catch (error) {
      setToast({
        message: error instanceof Error ? error.message : 'Failed to upload certificate',
        type: 'error'
      })
    }
  }

  // Delete certificate
  async function deleteCertificate() {
    try {
      const response = await fetch('/api/settings/certificates?type=ca', {
        method: 'DELETE'
      })

      if (!response.ok) throw new Error('Failed to delete certificate')

      setToast({ message: 'Certificate deleted successfully', type: 'success' })
      await loadCertificateStatus()

      if (settings) {
        setSettings(prev => prev ? {
          ...prev,
          mqtt: { ...prev.mqtt, caCertPath: null }
        } : null)
      }
    } catch (error) {
      setToast({
        message: error instanceof Error ? error.message : 'Failed to delete certificate',
        type: 'error'
      })
    }
  }

  // Add topic pattern
  function addTopicPattern() {
    if (!newTopic.trim() || !settings) return

    setSettings(prev => prev ? {
      ...prev,
      mqtt: {
        ...prev.mqtt,
        topicPatterns: [...prev.mqtt.topicPatterns, newTopic.trim()]
      }
    } : null)
    setNewTopic("")
  }

  // Remove topic pattern
  function removeTopicPattern(index: number) {
    if (!settings) return

    setSettings(prev => prev ? {
      ...prev,
      mqtt: {
        ...prev.mqtt,
        topicPatterns: prev.mqtt.topicPatterns.filter((_, i) => i !== index)
      }
    } : null)
  }

  // Clear toast after 3 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [toast])

  // Load data points for deletion selection
  async function loadDataPoints() {
    try {
      const response = await fetch('/api/data/points')
      if (!response.ok) throw new Error('Failed to load points')
      const data = await response.json()
      setDataPoints(data.points || [])
    } catch (error) {
      console.error('Failed to load data points:', error)
    }
  }

  useEffect(() => {
    loadDataPoints()
  }, [])

  // Preview delete count
  async function previewDelete(type: 'points' | 'time_range' | 'all') {
    try {
      let url = '/api/data/delete?type=' + type
      if (type === 'points' && selectedPoints.length > 0) {
        url += '&haystack_names=' + selectedPoints.join(',')
      } else if (type === 'time_range' && deleteFromDate && deleteToDate) {
        url += `&from=${deleteFromDate}&to=${deleteToDate}`
      }

      const response = await fetch(url)
      if (!response.ok) throw new Error('Failed to preview')
      const data = await response.json()
      setDeletePreviewCount(data.count)
    } catch (error) {
      console.error('Preview error:', error)
      setDeletePreviewCount(null)
    }
  }

  // Execute delete
  async function executeDelete(type: 'points' | 'time_range' | 'all') {
    setDeleting(true)
    try {
      const body: { type: string; haystack_names?: string[]; from?: string; to?: string } = { type }

      if (type === 'points') {
        body.haystack_names = selectedPoints
      } else if (type === 'time_range') {
        body.from = deleteFromDate
        body.to = deleteToDate
      }

      const response = await fetch('/api/data/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      if (!response.ok) throw new Error('Failed to delete')

      setToast({ message: 'Data deleted successfully', type: 'success' })

      setSelectedPoints([])
      setDeleteFromDate("")
      setDeleteToDate("")
      setDeleteAllConfirm("")
      setDeletePreviewCount(null)

      await loadDataPoints()
    } catch (error) {
      setToast({
        message: error instanceof Error ? error.message : 'Failed to delete data',
        type: 'error'
      })
    } finally {
      setDeleting(false)
    }
  }

  // Toggle point selection
  function togglePointSelection(pointName: string) {
    setSelectedPoints(prev =>
      prev.includes(pointName)
        ? prev.filter(p => p !== pointName)
        : [...prev, pointName]
    )
    setDeletePreviewCount(null)
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6 flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!settings) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertDescription>Failed to load settings</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Toast */}
      {toast && (
        <Alert variant={toast.type === 'success' ? 'default' : 'destructive'} className="fixed top-20 right-6 z-50 w-auto">
          <AlertDescription>{toast.message}</AlertDescription>
        </Alert>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-muted-foreground">Configure MQTT connection and data storage</p>
        </div>
        <div className="flex items-center gap-3">
          {hasUnsavedChanges && (
            <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">
              Unsaved changes
            </Badge>
          )}
          <Button onClick={saveSettings} disabled={saving} variant={hasUnsavedChanges ? "default" : "outline"}>
            <Save className={`w-4 h-4 ${saving ? 'animate-spin' : ''}`} />
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* MQTT Connection */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Wifi className="w-5 h-5" />
              MQTT Connection
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="broker">Broker Address</Label>
              <Input
                id="broker"
                value={settings.mqtt.broker}
                onChange={(e) => setSettings(prev => prev ? {
                  ...prev,
                  mqtt: { ...prev.mqtt, broker: e.target.value }
                } : null)}
                placeholder="e.g., 10.0.60.3"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="port">Port</Label>
                <Input
                  id="port"
                  type="number"
                  value={settings.mqtt.port}
                  onChange={(e) => setSettings(prev => prev ? {
                    ...prev,
                    mqtt: { ...prev.mqtt, port: parseInt(e.target.value) || 1883 }
                  } : null)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="clientId">Client ID</Label>
                <Input
                  id="clientId"
                  value={settings.mqtt.clientId}
                  onChange={(e) => setSettings(prev => prev ? {
                    ...prev,
                    mqtt: { ...prev.mqtt, clientId: e.target.value }
                  } : null)}
                />
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={settings.mqtt.username}
                  onChange={(e) => setSettings(prev => prev ? {
                    ...prev,
                    mqtt: { ...prev.mqtt, username: e.target.value }
                  } : null)}
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={settings.mqtt.password}
                  onChange={(e) => setSettings(prev => prev ? {
                    ...prev,
                    mqtt: { ...prev.mqtt, password: e.target.value }
                  } : null)}
                  placeholder="Optional"
                />
              </div>
            </div>

            <Separator />

            <div className="flex items-center gap-3">
              <Checkbox
                id="enabled"
                checked={settings.mqtt.enabled}
                onCheckedChange={(checked) => setSettings(prev => prev ? {
                  ...prev,
                  mqtt: { ...prev.mqtt, enabled: checked === true }
                } : null)}
              />
              <Label htmlFor="enabled" className="cursor-pointer font-medium">
                Enable MQTT connection
              </Label>
            </div>
          </CardContent>
        </Card>

        {/* TLS/SSL Settings */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              {settings.mqtt.tlsEnabled ? <Shield className="w-5 h-5" /> : <ShieldOff className="w-5 h-5 text-muted-foreground" />}
              TLS/SSL Security
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Checkbox
                id="tlsEnabled"
                checked={settings.mqtt.tlsEnabled}
                onCheckedChange={(checked) => setSettings(prev => prev ? {
                  ...prev,
                  mqtt: { ...prev.mqtt, tlsEnabled: checked === true }
                } : null)}
              />
              <Label htmlFor="tlsEnabled" className="cursor-pointer font-medium">
                Enable TLS/SSL encryption
              </Label>
            </div>

            {settings.mqtt.tlsEnabled && (
              <>
                <Separator />

                <Alert variant="default" className="border-amber-200 bg-amber-50">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="tlsInsecure"
                      checked={settings.mqtt.tlsInsecure}
                      onCheckedChange={(checked) => setSettings(prev => prev ? {
                        ...prev,
                        mqtt: { ...prev.mqtt, tlsInsecure: checked === true }
                      } : null)}
                    />
                    <Label htmlFor="tlsInsecure" className="cursor-pointer text-amber-800">
                      Skip certificate verification (insecure)
                    </Label>
                  </div>
                </Alert>

                {!settings.mqtt.tlsInsecure && (
                  <>
                    <Separator />

                    <div className="space-y-2">
                      <Label>CA Certificate</Label>

                      {certStatus?.ca.exists ? (
                        <div className="flex items-center justify-between p-3 border rounded-lg bg-emerald-50 border-emerald-200">
                          <span className="text-sm font-medium text-emerald-700">
                            {certStatus.ca.filename}
                          </span>
                          <Button variant="ghost" size="sm" onClick={deleteCertificate}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      ) : (
                        <div>
                          <input
                            type="file"
                            ref={fileInputRef}
                            accept=".pem,.crt,.cer"
                            onChange={(e) => {
                              const file = e.target.files?.[0]
                              if (file) uploadCertificate(file)
                            }}
                            className="hidden"
                          />
                          <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="w-full">
                            <Upload className="w-4 h-4" />
                            Upload CA Certificate
                          </Button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Topic Subscriptions */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Hash className="w-5 h-5" />
              Topic Subscriptions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={newTopic}
                onChange={(e) => setNewTopic(e.target.value)}
                placeholder="e.g., bacnet/#"
                className="font-mono text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addTopicPattern()
                }}
              />
              <Button onClick={addTopicPattern} size="icon">
                <Plus className="w-4 h-4" />
              </Button>
            </div>

            <div className="border rounded-lg overflow-hidden">
              {settings.mqtt.topicPatterns.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4 bg-muted">
                  No topics configured
                </p>
              ) : (
                settings.mqtt.topicPatterns.map((pattern, index) => (
                  <div
                    key={index}
                    className={`flex items-center justify-between py-2 px-3 ${index > 0 ? 'border-t' : ''} ${index % 2 === 0 ? 'bg-muted/50' : ''}`}
                  >
                    <code className="text-sm font-mono">{pattern}</code>
                    <Button variant="ghost" size="sm" onClick={() => removeTopicPattern(index)}>
                      <X className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                ))
              )}
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>QoS Level</Label>
              <Select
                value={settings.mqtt.qos.toString()}
                onValueChange={(value) => setSettings(prev => prev ? {
                  ...prev,
                  mqtt: { ...prev.mqtt, qos: parseInt(value) }
                } : null)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select QoS" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">0 - At most once</SelectItem>
                  <SelectItem value="1">1 - At least once</SelectItem>
                  <SelectItem value="2">2 - Exactly once</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Data Management */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Database className="w-5 h-5" />
              Data Management
            </CardTitle>
            <CardDescription>
              Configure retention and manage stored data
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Retention */}
            <div className="space-y-2">
              <Label htmlFor="retention">Data Retention (days)</Label>
              <Input
                id="retention"
                type="number"
                value={settings.system.retentionDays}
                onChange={(e) => setSettings(prev => prev ? {
                  ...prev,
                  system: { ...prev.system, retentionDays: parseInt(e.target.value) || 30 }
                } : null)}
                min={1}
                max={365}
              />
              <p className="text-xs text-muted-foreground">
                Data older than this will be automatically deleted
              </p>
            </div>

            <Separator />

            {/* Delete by Points */}
            <div className="space-y-2">
              <Label>Delete by Points</Label>
              <div className="border rounded-lg max-h-32 overflow-y-auto">
                {dataPoints.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-3">No data points</p>
                ) : (
                  dataPoints.map((point, index) => (
                    <div
                      key={point.name}
                      className={`flex items-center justify-between py-2 px-3 cursor-pointer hover:bg-muted ${index > 0 ? 'border-t' : ''} ${selectedPoints.includes(point.name) ? 'bg-primary/10' : ''}`}
                      onClick={() => togglePointSelection(point.name)}
                    >
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={selectedPoints.includes(point.name)}
                          onClick={(e) => e.stopPropagation()}
                          onCheckedChange={() => togglePointSelection(point.name)}
                        />
                        <code className="text-xs font-mono truncate max-w-48">{point.name}</code>
                      </div>
                      <Badge variant="secondary" className="text-xs">{point.count}</Badge>
                    </div>
                  ))
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => previewDelete('points')} disabled={selectedPoints.length === 0}>
                  Preview
                </Button>
                <Button variant="destructive" size="sm" onClick={() => executeDelete('points')} disabled={selectedPoints.length === 0 || deleting}>
                  <Trash2 className="w-4 h-4" />
                  Delete ({selectedPoints.length})
                </Button>
                {deletePreviewCount !== null && selectedPoints.length > 0 && (
                  <span className="text-xs text-muted-foreground">{deletePreviewCount.toLocaleString()} records</span>
                )}
              </div>
            </div>

            <Separator />

            {/* Delete by Time Range */}
            <div className="space-y-2">
              <Label>Delete by Time Range</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="datetime-local"
                  value={deleteFromDate}
                  onChange={(e) => { setDeleteFromDate(e.target.value); setDeletePreviewCount(null) }}
                  placeholder="From"
                />
                <Input
                  type="datetime-local"
                  value={deleteToDate}
                  onChange={(e) => { setDeleteToDate(e.target.value); setDeletePreviewCount(null) }}
                  placeholder="To"
                />
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => previewDelete('time_range')} disabled={!deleteFromDate || !deleteToDate}>
                  Preview
                </Button>
                <Button variant="destructive" size="sm" onClick={() => executeDelete('time_range')} disabled={!deleteFromDate || !deleteToDate || deleting}>
                  <Trash2 className="w-4 h-4" />
                  Delete Range
                </Button>
                {deletePreviewCount !== null && deleteFromDate && deleteToDate && (
                  <span className="text-xs text-muted-foreground">{deletePreviewCount.toLocaleString()} records</span>
                )}
              </div>
            </div>

            <Separator />

            {/* Delete All */}
            <Alert variant="destructive">
              <AlertTriangle className="w-4 h-4" />
              <AlertDescription className="space-y-2">
                <p className="font-medium">Danger Zone</p>
                <p className="text-xs">Permanently delete ALL sensor data. This cannot be undone.</p>
                <div className="flex items-center gap-2 mt-2">
                  <Input
                    placeholder="Type DELETE to confirm"
                    value={deleteAllConfirm}
                    onChange={(e) => setDeleteAllConfirm(e.target.value)}
                    className="max-w-40 h-8 text-sm"
                  />
                  <Button variant="destructive" size="sm" onClick={() => executeDelete('all')} disabled={deleteAllConfirm !== 'DELETE' || deleting}>
                    <Trash2 className="w-4 h-4" />
                    Delete All
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
