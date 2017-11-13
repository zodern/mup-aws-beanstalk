import fs from 'fs';
import client from './aws';

export default function upload(appConfig, bucket, key, bundlePath, showProgress) {
  const { s3 } = client(appConfig);

  const params = { Bucket: bucket };
  const fileStream = fs.createReadStream(bundlePath);
  fileStream.on('error', (err) => {
    console.log(err);
  });

  params.Body = fileStream;
  params.Key = key;

  return new Promise((resolve, reject) => {
    const uploader = s3.upload(params);

    uploader.on('httpUploadProgress', (progress) => {
      const percentage = Math.floor(progress.loaded / progress.total) * 100;

      console.log(`  Uploaded ${percentage}%`);

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
