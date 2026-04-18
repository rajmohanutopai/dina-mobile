/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^@dina/test-harness$': '<rootDir>/../test-harness/src/index',
    '^@dina/test-harness/(.*)$': '<rootDir>/../test-harness/src/$1',
    '^react-native$': '<rootDir>/__mocks__/react-native.ts',
    '^react-native-keychain$': '<rootDir>/__mocks__/react-native-keychain.ts',
    '^expo-file-system$': '<rootDir>/__mocks__/expo-file-system.ts',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
    // Transform ESM-only @noble/@scure packages
    '^.+\\.js$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@noble|@scure|ai|@ai-sdk)/)',
  ],
};
