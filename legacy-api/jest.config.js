/**
 * Jest was already a devDependency here but had never been configured, so the
 * project carried a test toolchain it could not run. This is the minimum that
 * makes it usable: TypeScript via ts-jest, and the same `@/` path alias the
 * application code and tsconfig use.
 */
module.exports = {
  preset: 'ts-jest',
  transform: {
    // Test globals come from tsconfig.test.json, so the production build's
    // `types: ["node"]` stays clean.
    '^.+\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
  },
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // Only what a unit test needs; the Prisma client and the HTTP layer are not
  // pulled in, so this suite runs without a database.
  testMatch: ['**/*.test.ts'],
};
