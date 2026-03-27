import type { Config } from 'jest'

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: ['**/__tests__/**/*.test.ts'],
  passWithNoTests: true,
  transformIgnorePatterns: [
    '/node_modules/(?!(next-auth|@auth/core|@panva|preact|preact-render-to-string)/)',
  ],
}

export default config
