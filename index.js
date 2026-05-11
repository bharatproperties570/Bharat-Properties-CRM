import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';

// 🛡️ Senior Professional: Global Browser Polyfill for Native
// MUST BE AT THE TOP before App and other modules are imported
if (Platform.OS !== 'web') {
    if (typeof global.window === 'undefined') {
        global.window = global;
    }
    if (typeof global.document === 'undefined') {
        global.document = {
            createElement: () => ({ style: {}, appendChild: () => {}, removeChild: () => {}, focus: () => {} }),
            head: { appendChild: () => {} },
            body: { appendChild: () => {}, removeChild: () => {}, style: {} },
            getElementById: () => null,
            addEventListener: () => {},
            removeEventListener: () => {},
        };
    }
    if (typeof global.localStorage === 'undefined') {
        global.localStorage = {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
            clear: () => {},
        };
    }
    if (typeof global.CustomEvent === 'undefined') {
        global.CustomEvent = class CustomEvent {
            constructor(type, params) {
                this.type = type;
                this.detail = params?.detail;
            }
        };
    }
    if (typeof global.location === 'undefined') {
        global.location = { pathname: '/', search: '', hash: '', href: '' };
    }
    if (typeof global.navigator === 'undefined') {
        global.navigator = { userAgent: 'React Native' };
    }
    if (typeof global.history === 'undefined') {
        global.history = { pushState: () => {}, back: () => {}, replaceState: () => {} };
    }
}

import App from './src/App';

// [DEBUG] Entry point for Expo/Metro
console.log('[DEBUG] index.js: Registering root component for platform:', Platform.OS);

if (Platform.OS === 'web') {
    // Manual mount for Web to be absolutely sure
    const rootTag = typeof document !== 'undefined' ? (document.getElementById('root') || document.getElementById('main')) : null;
    if (rootTag) {
        console.log('[DEBUG] Found root tag, mounting manually');
    }
}

registerRootComponent(App);
