const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// 🛡️ Senior Professional: Prioritize Native Extensions
// This ensures App.native.js is used for mobile while App.js remains for Web
config.resolver.sourceExts = [
    'native.js',
    'native.jsx',
    'native.ts',
    'native.tsx',
    'js',
    'jsx',
    'json',
    'ts',
    'tsx'
];

module.exports = config;
