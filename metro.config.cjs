const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add .mjs and .cjs extensions to the resolver
config.resolver.sourceExts.push('mjs', 'cjs');

module.exports = config;
