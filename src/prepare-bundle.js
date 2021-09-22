import archiver from 'archiver';
import fs from 'fs';
import ejs from 'ejs';
import { round } from 'lodash';
import { getNodeVersion, logStep, names } from './utils';

function copy(source, destination, vars = {}) {
  let contents = fs.readFileSync(source).toString();

  contents = ejs.render(
    contents,
    {
      ...vars,
      padScript(content, spaces) {
        const padding = ''.padStart(spaces, ' ');
        return content.split('\n').map(line => padding + line).join('\n');
      }
    },
    {
      filename: source
    }
  );

  fs.writeFileSync(destination, contents);
}

export function injectFiles(api, name, version, appConfig) {
  const {
    yumPackages,
    forceSSL,
    gracefulShutdown,
    buildOptions,
    longEnvVars
  } = appConfig;
  const bundlePath = buildOptions.buildLocation;
  const {
    bucket
  } = names({ app: appConfig });

  let sourcePath = api.resolvePath(__dirname, './assets/package.json');
  let destPath = api.resolvePath(bundlePath, 'bundle/package.json');
  copy(sourcePath, destPath, {
    name,
    version
  });

  sourcePath = api.resolvePath(__dirname, './assets/npmrc');
  destPath = api.resolvePath(bundlePath, 'bundle/.npmrc');
  copy(sourcePath, destPath);

  sourcePath = api.resolvePath(__dirname, './assets/start.sh');
  destPath = api.resolvePath(bundlePath, 'bundle/start.sh');
  copy(sourcePath, destPath);

  [
    '.ebextensions',
    '.platform',
    '.platform/hooks',
    '.platform/hooks/prebuild',
    '.platform/nginx',
    '.platform/nginx/conf.d'
  ].forEach((folder) => {
    try {
      fs.mkdirSync(api.resolvePath(bundlePath, 'bundle', folder));
    } catch (e) {
      if (e.code !== 'EEXIST') {
        throw e;
      }
    }
  });


  // For some resources we make two copies of scripts:
  // 1) In .platform/hooks. These are used in AWS Linux 2
  // 2) as part of a config file in .ebextensions for older platforms
  const { nodeVersion, npmVersion } = getNodeVersion(api, bundlePath);
  sourcePath = api.resolvePath(__dirname, './assets/node.yaml');
  destPath = api.resolvePath(bundlePath, 'bundle/.ebextensions/node.config');
  copy(sourcePath, destPath, { nodeVersion, npmVersion });

  sourcePath = api.resolvePath(__dirname, './assets/node.sh');
  destPath = api.resolvePath(bundlePath, 'bundle/.platform/hooks/prebuild/45node.sh');
  copy(sourcePath, destPath, { nodeVersion, npmVersion });

  sourcePath = api.resolvePath(__dirname, './assets/nginx.yaml');
  destPath = api.resolvePath(bundlePath, 'bundle/.ebextensions/nginx.config');
  copy(sourcePath, destPath, { forceSSL });

  sourcePath = api.resolvePath(__dirname, './assets/nginx.conf');
  destPath = api.resolvePath(bundlePath, 'bundle/.platform/nginx/conf.d/nginx.conf');
  copy(sourcePath, destPath, { forceSSL });

  if (yumPackages) {
    sourcePath = api.resolvePath(__dirname, './assets/packages.yaml');
    destPath = api.resolvePath(bundlePath, 'bundle/.ebextensions/packages.config');
    copy(sourcePath, destPath, { packages: yumPackages });
  }

  if (gracefulShutdown) {
    sourcePath = api.resolvePath(__dirname, './assets/graceful_shutdown.yaml');
    destPath = api.resolvePath(bundlePath, 'bundle/.ebextensions/graceful_shutdown.config');
    copy(sourcePath, destPath);

    sourcePath = api.resolvePath(__dirname, './assets/graceful_shutdown.sh');
    destPath = api.resolvePath(bundlePath, 'bundle/.platform/hooks/prebuild/48graceful_shutdown.sh');
    copy(sourcePath, destPath);
  }

  if (longEnvVars) {
    sourcePath = api.resolvePath(__dirname, './assets/env.yaml');
    destPath = api.resolvePath(bundlePath, 'bundle/.ebextensions/env.config');
    copy(sourcePath, destPath, {
      bucketName: bucket
    });

    sourcePath = api.resolvePath(__dirname, './assets/env.sh');
    destPath = api.resolvePath(bundlePath, 'bundle/.platform/hooks/prebuild/47env.sh');
    copy(sourcePath, destPath, {
      bucketName: bucket
    });
  }

  sourcePath = api.resolvePath(__dirname, './assets/health-check.js');
  destPath = api.resolvePath(bundlePath, 'bundle/health-check.js');
  copy(sourcePath, destPath);
}

export function archiveApp(buildLocation, api) {
  const bundlePath = api.resolvePath(buildLocation, 'bundle.zip');

  try {
    fs.unlinkSync(bundlePath);
  } catch (e) {
    // empty
  }

  return new Promise((resolve, reject) => {
    logStep('=> Archiving Bundle');
    const sourceDir = api.resolvePath(buildLocation, 'bundle');

    const output = fs.createWriteStream(bundlePath);
    const archive = archiver('zip', {
      gzip: true,
      gzipOptions: {
        level: 9
      }
    });

    archive.pipe(output);
    output.once('close', resolve);

    archive.once('error', (err) => {
      logStep('=> Archiving failed:', err.message);
      reject(err);
    });

    let nextProgress = 0.1;
    archive.on('progress', ({ entries }) => {
      try {
        const progress = entries.processed / entries.total;

        if (progress > nextProgress) {
          console.log(`  ${round(Math.floor(nextProgress * 100), -1)}% Archived`);
          nextProgress += 0.1;
        }
      } catch (e) {
        console.log(e);
      }
    });

    archive.directory(sourceDir, false, (entry) => {
      if (entry.name.startsWith('.platform/hooks/')) {
        // Hooks must be executable for AWS Beanstalk to run them
        // Windows doesn't have a way to make a file be executable, so we
        // set it in the zip file
        entry.mode = 0o777;
      }
      return entry;
    }).finalize();
  });
}
