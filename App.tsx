import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { AppLockGate } from './src/security/AppLockGate';

function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <AppLockGate>
        <RootNavigator />
      </AppLockGate>
    </SafeAreaProvider>
  );
}

export default App;
