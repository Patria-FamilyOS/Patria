const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Expo's virtual `/expo/virtual/env.js` does require.context on the project root
// for `/^\.\/\.env/`. That pulls in `.env.e2e.local`, which is not one of the
// names Expo parses as dotenv (only `.env`, `.env.local`, `.env.development`,
// `.env.production` and their `.local` variants). Metro then bundles the `#`
// comment as JavaScript. Keep `.env` itself off this list so `npx expo start`
// can still HMR the hosted test project env.
const envFile = /(?:^|\/)\.env\.e2e(?:\..+)?$/;

function withBlockList(existing, extra) {
  if (!existing) {
    return extra;
  }
  if (existing instanceof RegExp) {
    return new RegExp(`(?:${existing.source})|(?:${extra.source})`);
  }
  if (Array.isArray(existing)) {
    return [...existing, extra];
  }
  return [existing, extra];
}

config.resolver.blockList = withBlockList(config.resolver.blockList, envFile);

if (process.env.EXPO_PUBLIC_E2E !== '1') {
  const blockedSamples = path.resolve(__dirname, 'src/features/memories/e2ePhotoSamples.blocked.ts');
  const previousResolve = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (moduleName.includes('e2ePhotoSamples.bundle') || /assets\/e2e\/sample\d+\.jpg(?:\?.*)?$/.test(moduleName)) {
      return { type: 'sourceFile', filePath: blockedSamples };
    }
    if (previousResolve) {
      return previousResolve(context, moduleName, platform);
    }
    return context.resolveRequest(context, moduleName, platform);
  };
}

module.exports = config;
