import fs from 'fs';
import random from 'random-seed';
import os from 'os';
import uuid from 'uuid';

export function shouldRebuild(bundlePath, useCachedBuild) {
  if (fs.existsSync(bundlePath) && useCachedBuild) {
    return false;
  }

  return true;
}

export function tmpBuildPath(appPath, api) {
  const rand = random.create(appPath);
  const uuidNumbers = [];

  for (let i = 0; i < 16; i++) {
    uuidNumbers.push(rand(255));
  }

  return api.resolvePath(
    os.tmpdir(),
    `mup-meteor-${uuid.v4({ random: uuidNumbers })}`
  );
}

export function names(config) {
  return {
    bucket: `mup-${config.app.name}`,
    environment: `mup-env-${config.app.name}`,
    app: `mup-${config.app.name}`,
    bundlePrefix: `mup/bundles/${config.app.name}/`
  };
}