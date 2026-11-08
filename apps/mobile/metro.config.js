// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');
const localNodeModules = path.resolve(projectRoot, 'node_modules');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

// 1. Watch all files in monorepo
config.watchFolders = [monorepoRoot];

// 2. Resolve modules from local first, then root node_modules
config.resolver.nodeModulesPaths = [
  localNodeModules,
  path.resolve(monorepoRoot, 'node_modules'),
];

// 3. Explicitly alias packages to ensure single instances in bundle
config.resolver.extraNodeModules = {
  '@aiva/types': path.resolve(monorepoRoot, 'packages/shared/types'),
  '@aiva/api-client': path.resolve(monorepoRoot, 'packages/shared/api-client'),
  react: path.resolve(localNodeModules, 'react'),
  'react-native': path.resolve(localNodeModules, 'react-native'),
  '@react-navigation/native': path.resolve(localNodeModules, '@react-navigation/native'),
};

module.exports = config;
