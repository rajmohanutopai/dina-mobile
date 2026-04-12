/**
 * Metro config for Expo monorepo — resolves @dina/core and @dina/brain
 * from sibling workspace packages.
 */

const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch all monorepo packages
config.watchFolders = [monorepoRoot];

// Resolve node_modules from both app and monorepo root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Ensure .ts and .tsx are resolved
config.resolver.sourceExts = [...(config.resolver.sourceExts || []), 'ts', 'tsx'];

module.exports = config;
