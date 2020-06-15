import fs from 'fs';
import shellEscape from 'shell-escape';
import { s3 } from './aws';

export default function upload(appConfig, bucket, key, bundlePath) {
  const params = { Bucket: bucket };
  const fileStream = fs.createReadStream(bundlePath);
  fileStream.on('error', (err) => {
    console.log(err);
  });

  params.Body = fileStream;
  params.Key = key;

  return new Promise((resolve, reject) => {
    let lastPercentage = -1;

    const uploader = s3.upload(params);

    uploader.on('httpUploadProgress', (progress) => {
      const percentage = Math.floor(progress.loaded / progress.total * 100);

      if (percentage !== lastPercentage) {
        console.log(`  Uploaded ${percentage}%`);

        if (percentage === 100) {
          console.log('  Finishing upload. This could take a couple minutes');
        }
      }

      lastPercentage = percentage;
    });

    uploader.send((err, result) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(result);
    });
  });
}

export function uploadEnvFile(bucket, version, env, settings) {
  let content = '';
  const settingsString = encodeURIComponent(JSON.stringify(settings));

  Object.keys(env).forEach((key) => {
    const value = shellEscape([env[key]]);
    content += `export ${key}=${value}\n`;
  });

  content += `export METEOR_SETTINGS_ENCODED=${shellEscape([settingsString])}`;

  return new Promise((resolve, reject) => {
    const uploader = s3.upload({
      Bucket: bucket,
      Body: content,
      Key: `env/${version}.txt`
    });
    uploader.send((err, result) => {
      if (err) {
        return reject(err);
      }

      resolve(result);
    });
  });
}
