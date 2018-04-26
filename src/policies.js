export function trailBucketPolicy(accountId, bucketName) {
  const policy = {
    Version: '2012-10-17',
    Statement: [{
      Sid: 'AWSCloudTrailAclCheck20150319',
      Effect: 'Allow',
      Principal: {
        Service: 'cloudtrail.amazonaws.com'
      },
      Action: 's3:GetBucketAcl',
      Resource: `arn:aws:s3:::${bucketName}`
    },
    {
      Sid: 'AWSCloudTrailWrite20150319',
      Effect: 'Allow',
      Principal: {
        Service: 'cloudtrail.amazonaws.com'
      },
      Action: 's3:PutObject',
      Resource: `arn:aws:s3:::${bucketName}/AWSLogs/${accountId}/*`,
      Condition: {
        StringEquals: {
          's3:x-amz-acl': 'bucket-owner-full-control'
        }
      }
    }
    ]
  };

  return JSON.stringify(policy);
}

export const rolePolicy = '{ "Version": "2008-10-17", "Statement": [ { "Effect": "Allow", "Principal": { "Service": "ec2.amazonaws.com" }, "Action": "sts:AssumeRole" } ] }';
export const serviceRole = '{ "Version": "2012-10-17", "Statement": [ { "Effect": "Allow", "Principal": { "Service": "elasticbeanstalk.amazonaws.com" }, "Action": "sts:AssumeRole", "Condition": { "StringEquals": { "sts:ExternalId": "elasticbeanstalk" } } } ] }';
export const eventTargetRole = '{ "Version": "2012-10-17", "Statement": [ { "Effect": "Allow", "Principal": { "Service": "events.amazonaws.com" }, "Action": "sts:AssumeRole" } ] }';

export function eventTargetRolePolicy(accountId, env, region) {
  const policy = {
    Version: '2012-10-17',
    Statement: [
      {
        Action: 'ssm:SendCommand',
        Effect: 'Allow',
        Resource: [
          `arn:aws:ec2:${region}:${accountId}:instance/*`
        ],
        Condition: {
          StringEquals: {
            'ec2:ResourceTag/*': [
              env
            ]
          }
        }
      },
      {
        Action: 'ssm:SendCommand',
        Effect: 'Allow',
        Resource: [
          `arn:aws:ssm:${region}:*:document/AWS-RunShellScript`
        ]
      }
    ]
  };

  return JSON.stringify(policy);
}

export const DeregisterEvent = '{ "source": [ "aws.elasticloadbalancing" ], "detail-type": [ "AWS API Call via CloudTrail" ], "detail": { "eventSource": [ "elasticloadbalancing.amazonaws.com" ], "eventName": [ "DeregisterTargets" ] } }';

export const deregisterEventTarget = (envName, role, accountId, region) => ({
  Id: 'Id532384276978',
  Arn: `arn:aws:ssm:${region}::document/AWS-RunShellScript`,
  RoleArn: `arn:aws:iam::${accountId}:role/${role}`,
  InputTransformer: {
    InputPathsMap: {
      instance: '$.detail.requestParameters.targets[0].id'
    },
    InputTemplate: '{"commands":["cd /mup_graceful_shutdown", "ls", "PATH=\'/mup_graceful_shutdown\'", <instance>]}'
  },
  RunCommandParameters: {
    RunCommandTargets: [{
      Key: 'tag:elasticbeanstalk:environment-name',
      Values: [envName]
    }]
  }
});
