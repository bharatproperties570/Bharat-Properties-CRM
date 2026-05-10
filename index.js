import { registerRootComponent } from 'expo';
import App from './src/App.jsx';
import { Platform } from 'react-native';

// [DEBUG] Entry point for Expo/Metro
console.log('[DEBUG] index.js: Registering root component for platform:', Platform.OS);

if (Platform.OS === 'web') {
    // Manual mount for Web to be absolutely sure
    const rootTag = document.getElementById('root') || document.getElementById('main');
    if (rootTag) {
        console.log('[DEBUG] Found root tag, mounting manually');
    }
}

registerRootComponent(App);
