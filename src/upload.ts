import fs from 'fs';
import { s3 } from './aws';
import { Upload } from "@aws-sdk/lib-storage";

export default async function upload (
  bucket: string,
  key: string,
  bundlePath: string
) {
  const fileStream = fs.createReadStream(bundlePath);
  fileStream.on('error', (err) => {
    console.log(err);
  });

  const params = {
    Bucket: bucket,
    Key: key,
    Body: fileStream,
  };

  const uploader = new Upload({
    client: s3,
    params,
  });

  let lastPercentage = -1;

  uploader.on('httpUploadProgress', (progress) => {
    const percentage = Math.floor((progress.loaded || 0) / (progress.total || 0) * 100);

    if (percentage !== lastPercentage) {
      console.log(`  Uploaded ${percentage}%`);

      if (percentage === 100) {
        console.log('  Finishing upload. This could take a couple minutes');
      }
    }

    lastPercentage = percentage;
  });

  await uploader.done();
}

export async function uploadEnvFile(
  bucket: string,
  version: number,
  content: string
) {
  await s3.putObject({
    Bucket: bucket,
    Body: content,
    Key: `env/${version}.txt`
  });
}
