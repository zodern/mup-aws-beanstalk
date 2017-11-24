import fs from 'fs';
import {
  s3
} from './aws';

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
      const percentage = Math.floor(progress.loaded / progress.total) * 100;

      if (percentage !== lastPercentage) {
        console.log(`  Uploaded ${percentage}%`);
      }

      lastPercentage = percentage;

      if (percentage === 100) {
        console.log('  Finishing upload. This could take a couple minutes');
      }
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
