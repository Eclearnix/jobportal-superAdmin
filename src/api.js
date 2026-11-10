const apiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '')

export async function api(path, options = {}) {
  const headers = new Headers(options.headers || {})
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${apiBase}/api${path}`, {
    ...options,
    headers,
    credentials: 'include',
    body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body,
  })

  if (response.status === 204) return null
  const contentType = response.headers.get('Content-Type') || ''
  if (!contentType.toLowerCase().includes('application/json')) {
    if (!response.ok) throw new Error(`Request failed (${response.status}).`)
    throw new Error('The server returned an invalid API response. Check the Vercel API deployment and routing.')
  }
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`)
  return payload
}

export function queryString(values = {}) {
  const params = new URLSearchParams()
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
  })
  return params.toString() ? `?${params}` : ''
}
