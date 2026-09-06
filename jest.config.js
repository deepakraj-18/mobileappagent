module.exports = {
  preset: 'react-native',
  testPathIgnorePatterns: ['/node_modules/', '/__tests__/mocks/'],
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-navigation|react-native-screens|react-native-safe-area-context|react-native-gesture-handler|@react-native-async-storage)/)',
  ],
};
