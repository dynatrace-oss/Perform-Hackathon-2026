module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/*.test.js'],
  collectCoverageFrom: [
    'services/**/*.js',
    '!**/node_modules/**',
    '!**/proto/**',
    '!**/grpc/**'
  ],
  coverageDirectory: 'coverage',
  verbose: true
};

