const requests = new Map<string, { count: number; resetAt: number }>()

export function checkRateLimit(userId: string, limit = 30, windowMs = 60_000): boolean {
  const now = Date.now()
  const entry = requests.get(userId)
  if (!entry || now > entry.resetAt) {
    requests.set(userId, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (entry.count >= limit) return false
  entry.count++
  return true
}
