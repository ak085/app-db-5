/**
 * Get all IANA timezone names using the Intl API
 */
export function getAllTimezones(): string[] {
  try {
    // Intl.supportedValuesOf is available in modern browsers and Node.js 18+
    return Intl.supportedValuesOf('timeZone')
  } catch {
    // Fallback for older environments
    return [
      'UTC',
      'Africa/Cairo',
      'Africa/Johannesburg',
      'Africa/Lagos',
      'America/Anchorage',
      'America/Chicago',
      'America/Denver',
      'America/Los_Angeles',
      'America/New_York',
      'America/Sao_Paulo',
      'America/Toronto',
      'Asia/Bangkok',
      'Asia/Dubai',
      'Asia/Hong_Kong',
      'Asia/Jakarta',
      'Asia/Kolkata',
      'Asia/Kuala_Lumpur',
      'Asia/Manila',
      'Asia/Seoul',
      'Asia/Shanghai',
      'Asia/Singapore',
      'Asia/Tokyo',
      'Australia/Melbourne',
      'Australia/Perth',
      'Australia/Sydney',
      'Europe/Amsterdam',
      'Europe/Berlin',
      'Europe/Istanbul',
      'Europe/London',
      'Europe/Moscow',
      'Europe/Paris',
      'Pacific/Auckland',
      'Pacific/Honolulu'
    ]
  }
}
