/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  forceExit: true,
  testPathIgnorePatterns: ['/node_modules/', '/supabase/'],
  setupFiles: ['<rootDir>/jest.setup.ts'],
  modulePathIgnorePatterns: ['<rootDir>/supabase/'],
  moduleNameMapper: {
    '^react-native/setup-env$': '<rootDir>/jest.rn-setup-env.js',
    '^test-renderer$': 'react-test-renderer',
  },
};
