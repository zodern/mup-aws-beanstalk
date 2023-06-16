import { IAM } from '@aws-sdk/client-iam';
import { S3 } from '@aws-sdk/client-s3';
import { ElasticBeanstalk } from '@aws-sdk/client-elastic-beanstalk';
import { ACM } from '@aws-sdk/client-acm';
import { AutoScaling } from '@aws-sdk/client-auto-scaling';
import { CloudWatchEvents } from '@aws-sdk/client-cloudwatch-events';
import { CloudWatchLogs } from '@aws-sdk/client-cloudwatch-logs';
import { CloudTrail } from '@aws-sdk/client-cloudtrail';
import { EC2InstanceConnect } from '@aws-sdk/client-ec2-instance-connect';
import { STS } from '@aws-sdk/client-sts';
import { SSM } from '@aws-sdk/client-ssm';
import { EC2 } from '@aws-sdk/client-ec2';
import { MupAwsConfig } from "./types";

/* eslint-disable import/no-mutable-exports */
export let s3: S3;
export let beanstalk: ElasticBeanstalk;
export let iam: IAM;
export let autoScaling: AutoScaling;
export let acm: ACM;
export let cloudTrail: CloudTrail;
export let cloudWatchEvents: CloudWatchEvents;
export let sts: STS;
export let ssm: SSM;
export let ec2: EC2;
export let logs: CloudWatchLogs;
export let ec2InstanceConnect: EC2InstanceConnect;

/* eslint-enable import/no-mutable-exports */

const MAX_RETRY_DELAY = 1000 * 60 * 2;
// const AWS_UPLOAD_TIMEOUT = 1000 * 60 * 60;

export default function configure ({ auth, name: _name, region }: MupAwsConfig) {
  const commonOptions = {
    credentials: {
      accessKeyId: auth.id,
      secretAccessKey: auth.secret,
    },
    region: region || 'us-east-1',
    maxRetries: 25,
    retryDelayOptions: {
      customBackoff: (retryCount: number) => Math.min((2 ** retryCount * 1000), MAX_RETRY_DELAY)
    }
  };

  s3 = new S3({
    ...commonOptions,
    // params: { Bucket: `mup-${name}` },
    // httpOptions: { timeout: AWS_UPLOAD_TIMEOUT },
  });
  beanstalk = new ElasticBeanstalk({ ...commonOptions });
  iam = new IAM({ ...commonOptions });
  autoScaling = new AutoScaling({ ...commonOptions });
  acm = new ACM({ ...commonOptions });
  cloudTrail = new CloudTrail({ ...commonOptions });
  sts = new STS({ ...commonOptions });
  cloudWatchEvents = new CloudWatchEvents({ ...commonOptions });
  ssm = new SSM({ ...commonOptions });
  ec2 = new EC2({ ...commonOptions });
  logs = new CloudWatchLogs({ ...commonOptions });
  ec2InstanceConnect = new EC2InstanceConnect({ ...commonOptions });
}
