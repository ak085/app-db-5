# Storage App - MQTT to TimescaleDB Gateway

**Time-series data collection from MQTT with web-based configuration and monitoring**

[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker)](docker-compose.yml)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org/)
[![TimescaleDB](https://img.shields.io/badge/TimescaleDB-Latest-blue?logo=timescale)](https://www.timescale.com/)

---

## Quick Start

```bash
# Clone and deploy
git clone http://10.0.10.2:30008/ak101/app-db-5.git storage-app
cd storage-app
docker compose up -d

# Access UI
# http://<your-ip>:3002
# Login: admin / admin
```

---

## What is Storage App?

Storage App is a standalone data collection gateway that:
1. **Subscribes** to MQTT topics from any broker
2. **Stores** time-series data in TimescaleDB with dynamic JSONB schema
3. **Provides** web GUI for configuration, monitoring, and data management
4. **Exports** data in CSV or JSON format

Perfect for collecting and storing data from BacPipes edge devices, IoT sensors, or any MQTT-based data source.

---

## Architecture

```
┌─────────────────────────────────────────────┐
│ Storage App (Docker Compose)                │
├─────────────────────────────────────────────┤
│  Frontend (Next.js) - Port 3002             │
│  ├─ Dashboard (connection status)           │
│  ├─ Monitoring (data table view)            │
│  ├─ Settings (MQTT + TLS + data mgmt)       │
│  └─ Export (CSV/JSON download)              │
│                                             │
│  PostgreSQL - Port 5436                     │
│  └─ Configuration database                  │
│                                             │
│  TimescaleDB - Port 5435                    │
│  └─ Time-series data (JSONB schema)         │
│                                             │
│  Telegraf (Python)                          │
│  ├─ MQTT subscriber with TLS/Auth           │
│  └─ Writes to TimescaleDB                   │
└─────────────────────────────────────────────┘
         ↑ MQTT subscribe
┌─────────────────────────────────────────────┐
│ External MQTT Broker                        │
│ - BacPipes publishes here                   │
│ - Supports TLS and authentication           │
└─────────────────────────────────────────────┘
```

---

## Key Features

| Feature | Description |
|---------|-------------|
| **Web Authentication** | Session-based login with Master PIN protection |
| **MQTT Subscription** | Subscribe to any MQTT broker |
| **TLS/SSL Support** | Secure connections with certificate verification |
| **MQTT Authentication** | Username/password MQTT authentication |
| **Topic Patterns** | Flexible wildcard topic subscriptions |
| **Dynamic Schema** | JSONB metadata adapts to any payload structure |
| **Data Monitoring** | Real-time data table with filtering |
| **Data Management** | Delete by points, time range, or all data |
| **Data Export** | CSV and JSON download with dynamic columns |
| **Auto Compression** | TimescaleDB compresses old data |
| **Retention Policy** | Configurable automatic data cleanup |

---

## First-Time Setup

1. **Login**: http://your-ip:3002/login
   - Username: `admin`
   - Password: `admin`
2. **Set Master PIN** (recommended):
   - Go to Settings > Security Settings
   - Set a 4-6 digit Master PIN
3. **Configure MQTT**:
   - Go to Settings page
   - Enter MQTT broker IP/hostname
   - Configure authentication if needed
   - Enable TLS if required
4. **Set Topic Patterns**:
   - Add topic patterns to subscribe (e.g., `bacnet/#`)
   - Save settings
5. **Verify**:
   - Check Dashboard for connection status
   - View incoming data on Monitoring page

---

## Common Commands

| Operation | Command |
|-----------|---------|
| Start | `docker compose up -d` |
| Stop | `docker compose down` |
| Logs | `docker compose logs -f telegraf` |
| Restart telegraf | `docker compose restart telegraf` |
| Rebuild | `docker compose build && docker compose up -d` |
| Reset (delete data) | `docker compose down -v` |

---

## CLI Recovery Commands

| Command | Description |
|---------|-------------|
| `docker exec storage-frontend node scripts/reset-password.js` | Reset password to "admin" |
| `docker exec storage-frontend node scripts/reset-pin.js` | Remove master PIN |
| `docker exec storage-frontend node scripts/set-pin.js <pin>` | Set master PIN (4-6 digits) |

---

## Configuration

### Via Settings Page (Recommended)

All configuration is done via the web UI at `/settings`:
- MQTT Broker IP, Port, Client ID
- Username/Password Authentication
- TLS/SSL with certificate upload
- Topic subscription patterns
- QoS level
- Data retention period
- Data deletion tools

### Via Environment Variables (Optional)

For advanced customization, create a `.env` file:

```bash
# Database credentials (optional - defaults provided)
POSTGRES_USER=storage
POSTGRES_PASSWORD=storage123
TIMESCALE_USER=timescale
TIMESCALE_PASSWORD=timescale123
TZ=Asia/Kuala_Lumpur
```

---

## Port Allocation

| Port | Service |
|------|---------|
| 3002 | Web UI (Frontend) |
| 5435 | TimescaleDB |
| 5436 | PostgreSQL (Config) |

---

## Data Storage

### Dynamic JSONB Schema

The storage uses a hybrid schema with core indexed columns and flexible JSONB metadata:

```sql
-- Core columns (indexed for fast queries)
time, haystack_name, dis, value, units, quality

-- Dynamic metadata (adapts to any payload)
metadata JSONB  -- Contains: device_id, timezone, object_type, etc.
```

Benefits:
- No null columns - only stores what's published
- Auto-adapting - new fields captured automatically
- ML-ready - timezone in metadata for local time analysis

### TimescaleDB Features

- **Hypertable**: Automatic time-based partitioning
- **Compression**: Data older than 6 hours is compressed
- **Retention**: Data older than 30 days is deleted (configurable)
- **Continuous Aggregate**: 5-minute averages for fast queries

### Export Formats

**CSV Export** (dynamic columns based on metadata):
```csv
time,haystack_name,display_name,value,units,quality,device_id,timezone,...
2025-12-16T10:30:00.000Z,klcc.ahu.12.sensor.temp,AHU-12 Temp,23.5,degC,good,12345,Asia/Kuala_Lumpur,...
```

**JSON Export** (flattened with metadata):
```json
[
  {
    "time": "2025-12-16T10:30:00.000Z",
    "haystack_name": "klcc.ahu.12.sensor.temp",
    "dis": "AHU-12 Temp",
    "value": 23.5,
    "units": "degC",
    "quality": "good",
    "device_id": 12345,
    "timezone": "Asia/Kuala_Lumpur"
  }
]
```

---

## Troubleshooting

### MQTT Not Connecting
1. Check broker IP in Settings
2. Verify TLS settings match broker configuration
3. Check logs: `docker compose logs telegraf`

### No Data Appearing
1. Verify topic patterns match published topics
2. Check MQTT connection status on Dashboard
3. Ensure BacPipes or data source is publishing

### TimescaleDB Connection Error
1. Wait for database initialization (first startup)
2. Check logs: `docker compose logs timescaledb`

---

## Development

See `CLAUDE.md` for detailed development context.

**Project Structure:**
```
storage-app/
├── docker-compose.yml          # All services
├── frontend/                   # Next.js web app
│   ├── src/app/               # Pages and API routes
│   ├── src/lib/               # Auth and session utilities
│   ├── src/middleware.ts      # Route protection
│   ├── src/components/ui/     # shadcn/ui components
│   ├── scripts/               # CLI recovery scripts
│   ├── prisma/                # Database schema
│   └── Dockerfile
├── telegraf/                   # MQTT to TimescaleDB
│   ├── mqtt_to_timescaledb.py
│   └── Dockerfile
└── timescaledb/
    └── init/                  # Database initialization
```

---

## Repository

- **Gitea**: http://10.0.10.2:30008/ak101/app-db-5.git

---

**Last Updated:** December 2025
**Status:** Production-ready
