// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

// 1. Watch all files in monorepo
config.watchFolders = [monorepoRoot];

// 2. Resolve modules from both local and root node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// 3. Explicitly alias monorepo shared packages
config.resolver.extraNodeModules = {
  '@aiva/types': path.resolve(monorepoRoot, 'packages/shared/types'),
  '@aiva/api-client': path.resolve(monorepoRoot, 'packages/shared/api-client'),
};

module.exports = config;
