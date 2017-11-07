import AWS from 'aws-sdk';

let client = {};
let configured = false;

export default function configure({ auth, name }) {
  if (configured) {
    return client;
  }
  const options = {
    accessKeyId: auth.id,
    secretAccessKey: auth.secret,
    region: 'us-east-1'
  };

  AWS.config.update(options);
  configured = true;

  client = {
    s3: new AWS.S3({ params: { Bucket: `mup-${name}` }, apiVersion: '2006-03-01' }),
    beanstalk: new AWS.ElasticBeanstalk({ apiVersion: '2010-12-01' })
  };

  return client;
}
