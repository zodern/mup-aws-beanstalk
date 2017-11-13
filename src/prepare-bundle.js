import archiver from 'archiver';
import fs from 'fs';
import ejs from 'ejs';

function copy(source, destination, vars = {}) {
  let contents = fs.readFileSync(source).toString();

  contents = ejs.render(contents, vars);

  fs.writeFileSync(destination, contents);
}

export function injectFiles(api, name, version, bundlePath) {
  let sourcePath = api.resolvePath(__dirname, './assets/package.json');
  let destPath = api.resolvePath(bundlePath, 'bundle/package.json');
  copy(sourcePath, destPath, {
    name,
    version
  });

  sourcePath = api.resolvePath(__dirname, './assets/npmrc');
  destPath = api.resolvePath(bundlePath, 'bundle/.npmrc');
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
    // log('starting archive');
    console.log('=> Archiving Bundle');
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
      console.log('=> Archiving failed:', err.message);
      reject(err);
    });

    let nextProgress = 0.1;
    archive.on('progress', ({ entries }) => {
      try {
        const progress = entries.processed / entries.total;

        if (progress > nextProgress) {
          console.log(`  ${Math.floor(nextProgress * 100)}% Archived`);
          nextProgress += 0.1;
        }
      } catch (e) {
        console.log(e);
      }
    });

    archive.directory(sourceDir, false).finalize();
  });
}
