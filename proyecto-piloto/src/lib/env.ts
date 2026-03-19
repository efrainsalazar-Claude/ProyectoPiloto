function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

export const env = {
  DATABASE_URL: requireEnv("DATABASE_URL"),
  AUTH_GOOGLE_ID: requireEnv("AUTH_GOOGLE_ID"),
  AUTH_GOOGLE_SECRET: requireEnv("AUTH_GOOGLE_SECRET"),
  AUTH_SECRET: requireEnv("AUTH_SECRET"),
}
