import archiver from 'archiver';
import fs from 'fs';
import ejs from 'ejs';
import { round } from 'lodash';
import path from 'path';
import { getNodeVersion, logStep, names } from './utils';
import { MupApi, MupAwsConfig } from "./types";

function copyFolderSync(src: string, dest: string) {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });

  fs.readdirSync(src).forEach((dirent) => {
    const [srcPath, destPath] = [src, dest].map(dirPath => path.join(dirPath, dirent));
    const stat = fs.lstatSync(srcPath);

    switch (true) {
      case stat.isFile():
        console.log(` ... copying  ${srcPath} ${destPath}`);
        fs.copyFileSync(srcPath, destPath);
        break;
      case stat.isDirectory():
        copyFolderSync(srcPath, destPath);
        break;
      default:
        break;
    }
  });
}

function copy(source: string, destination: string, vars = {}) {
  let contents = fs.readFileSync(source).toString();

  contents = ejs.render(
    contents,
    {
      ...vars,
      padScript(content: string, spaces: number) {
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

export function injectFiles(api: MupApi, name: string, version: number, appConfig: MupAwsConfig) {
  const {
    yumPackages,
    forceSSL,
    gracefulShutdown,
    buildOptions,
    path: appPath
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
    '.platform/nginx/conf.d',
    '.platform/nginx/conf.d/elasticbeanstalk'
  ].forEach((folder) => {
    try {
      fs.mkdirSync(api.resolvePath(bundlePath, 'bundle', folder));
    } catch (e) {
      // @ts-ignore
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

  sourcePath = api.resolvePath(__dirname, './assets/nginx-server.conf');
  destPath = api.resolvePath(bundlePath, 'bundle/.platform/nginx/conf.d/elasticbeanstalk/00_application.conf');
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

  sourcePath = api.resolvePath(__dirname, './assets/health-check.js');
  destPath = api.resolvePath(bundlePath, 'bundle/health-check.js');
  copy(sourcePath, destPath);

  let customConfigPath = api.resolvePath(api.getBasePath(), `${appPath}/.ebextensions`);
  let customConfig = fs.existsSync(customConfigPath);
  if (customConfig) {
    console.log('  Copying files from project .ebextensions folder');
    fs.readdirSync(customConfigPath).forEach((file) => {
      sourcePath = api.resolvePath(customConfigPath, file);
      destPath = api.resolvePath(bundlePath, `bundle/.ebextensions/${file}`);
      copy(sourcePath, destPath);
    });
  }

  customConfigPath = api.resolvePath(api.getBasePath(), `${appPath}/.platform`);
  customConfig = fs.existsSync(customConfigPath);
  if (customConfig) {
    console.log('  Copying files from project .platform folder');
    copyFolderSync(customConfigPath, api.resolvePath(bundlePath, 'bundle/.platform'));
  }
}

export function archiveApp(buildLocation: string, api: MupApi) {
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

    archive.once('error', (err: Error) => {
      logStep(`=> Archiving failed: ${err.message}`);
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
