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
  transformIgnorePatterns: [
    '/node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|@noble/.*|@scure/.*)',
  ],
};
