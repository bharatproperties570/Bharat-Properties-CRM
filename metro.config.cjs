const { getDefaultConfig } = require('@expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add resolution for .jsx files
config.resolver.sourceExts.push('jsx', 'js', 'json');

module.exports = config;
