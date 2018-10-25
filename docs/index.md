## Getting Started

Read the [Getting Started tutorial](./getting-started.md).

## Config

- This plugin is configured with the `app` object in your config.
- `app.type` should be set to `aws-beanstalk` so Meteor Up knows this plugin will deploy and manage the app.
- You will need to add `mup-aws-beanstalk` to the `plugins` array in your config
- The `servers` object is not needed

Example config:

```js
module.exports = {
    app: {
        type: 'aws-beanstalk',
        // Must be at least 4 characters
        name: 'app-name',
        path: '../',
        auth: {
            // IAM user's Access key ID
            id: '12345',
            // IAM user's Secret access key
            secret: '6789'
        },
        env: {
            ROOT_URL: 'http://website.com',
            MONGO_URL: 'mongodb://user:pass@domain.com'
        },
        // (required) Minimum number of servers running your app
        minInstances: 2,
        // (optional, default is minInstances) Maximum number of servers
        // for autoscale to scale up to
        maxInstances: 5
    },
    plugins: ['mup-aws-beanstalk']
}
```

Complete example:
```js
module.exports = {
    app: {
        type: 'aws-beanstalk',
        // Must be at least 4 characters
        name: 'app-name',
        path: '../',
        auth: {
            // IAM user's Access key ID
            id: '12345',
            // IAM user's Secret access key
            secret: '6789'
        },
        env: {
            ROOT_URL: 'http://website.com',
            MONGO_URL: 'mongodb://user:pass@domain.com'
        },

        // (required) Minimum number of servers running your app
        minInstances: 2,
        // (optional, default is inInstances) Maximum number of servers
        // for autoscale to scale up to
        maxInstances: 5,

        // (optional, default is t2.micro) Type of instance to use
        instanceType: 't2.small',

        // (optional) Array of domains to request an ssl certificate for
        sslDomains: ['app.com', 'www.app.com'],

        // (optional) Redirect http to https
        forceSSL: true,

        // (optional, default is us-east-1) AWS region to deploy to
        region: 'us-west-1',

        // (optional) Packages to install with the yum package manager
        yumPackages: {
            // Property is the version. Leave as an empty string to install the latest version.
            'cairo': '',
            'cairo-devel': '',
            'libjpeg-turbo-devel': '',
            'pango': '',
            'pango-devel': '',
            'giflib-devel': ''
        },

        // (optional) Send a SIGTERM signal to the app instances 30 seconds before they will be shut down.
        gracefulShutdown: true,

        // (optional) Supports large environment variables and settings.json by storing them in s3.
        longEnvVars: true,

        // (optional, default is 3) Number of old application versions to keep
        oldVersions: 3,

        // (optional) Same options as when deploying with mup.
        // The one difference is serverOnly now defaults to true
        buildOptions: {
            // Default is true
            serverOnly: true,
            debug: false,
            buildLocation: '../../build',
            mobileSettings: {},
            server: 'http://app.com',
            allowIncompatibleUpdates: true,
            executable: 'meteor'
        },

        // (optional) Add additional files to add to the container.
        // "content" is a list of lines (strings) in the file.
        additionalFiles: [
          {
            //Adds "mylog.log" to the logs that are tailed and exported in elastic beanstalk
            filepath: "/opt/elasticbeanstalk/tasks/taillogs.d/mylog.conf",
            content: [
              "/var/log/mylog.log*"
            ]
          },
        ]

        // (optional) Override or add options in the beanstalk config
        // this plugin creates.You can customize any option on:
        // https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/command-options-general.html
        customBeanstalkConfig: [
            {
                namespace: 'aws:autoscaling:asg',
                option: 'Cooldown',
                value: '300'
            }
        ]
    },
    plugins: ['mup-aws-beanstalk']
}
```

Changes to `yumPackages`, `forceSSL`, `buildOptions`, and `longEnvVars` requires deploying a new version to take affect.

## Commands

- `mup deploy` Sets up and deploys your app to AWS Beanstalk
- `mup setup` Sets up AWS Beanstalk in preperation to deploy. Automatically run by `mup deploy`
- `mup reconfig` Update Meteor settings and the Beanstalk config. Automatically run by `mup deploy`
- `mup logs` View last 100 lines of the app's logs
- `mup logs-nginx` View nginx logs
- `mup beanstalk logs-eb` View last 100 lines of the logs from Beanstalk setting up the server and the app
- `mup stop` Scales the app to 0 instances
- `mup start` Scales the app back up after being stopped
- `mup restart` Restarts the app
- `mup beanstalk events` View events from the app's Beanstalk enviroment. Useful when troubleshooting problems.
- `mup beanstalk clean` Removes old application versions from s3 and Beanstalk. Is automatically run by `mup deploy`
- `mup beanstalk ssl` Sets up SSL and shows you it's current status. Automatically run by `mup reconfig` and `mup deploy`
- `mup beanstalk status` View the app's and server's health and http request stats

## Cost

AWS Elastic Beanstalk is free, but you do pay for the services it uses, including:

- EC2 Instances. By default, it uses `t2.micro`, which costs $8.50/month($0.012 / hour). While the Beanstalk environment is updating, or a new version is being deployed, 25% additional servers will be used.
- Application Load Balancer. Pricing details are at https://aws.amazon.com/elasticloadbalancing/pricing/
- S3. 3 - 4 app bundles are stored on s3. Each deploy will make 2 list requests and upload 1 file. Beanstalk might store additional files on s3.

Graceful Shutdown uses the following services:
- Cloud Trail. The trail is stored in s3 and, according to their docs, usually costs less than $3 / month.

## Rolling Deploys

When deploying a new version, there is no downtime, and the number of servers handling requests is not reduced.

Beanstalk is configured to use Rolling updates with additional batch with a batch size of 25%. This means that Beanstalk first creates an additional 25% instances and deploys the new version of the app to them. After the app has started, it will update the remaining servers in batches of 25%, except for the last 25%, which it terminates.

This does not apply when changing the instance type. Instead, Beanstalk terminates the instances and replaces them in batches of 1/3 (rounded to the nearest integer). If you only have one server, there will be downtime until the app is running on the new server. Before changing `instanceType`, increase `minInstances` to at least 2 and run `mup reconfig` to avoid downtime.

## Load balancing

Load balancing is automatically configured and supports web sockets and sticky sessions.

## Scale
To scale your app, modify `app.minInstances` in your mup config to how many servers you want your app deployed to. Then run `mup reconfig`.

You cannot scale to 0 servers. Instead, use `mup stop`.

AWS limits how many instances your account can have. To increase the limit, you will need to contact their customer support. Learn more [here](https://aws.amazon.com/premiumsupport/knowledge-center/manage-service-limits/).

## Autoscaling

To enable autoscaling, make sure that `app.maxInstances` in your mup config is greater than `app.minInstances`.

After modifying `app.maxInstances` or `app.minInstances`, run `mup reconfig`.

The average cpu for the previous 5 minutes is used to trigger autoscaling. When the average is above 75%, it will be scaled up, and an average below 35% scales down.

## Enhanced Health

Enhanced health is enabled for your app. No metrics are configured to be stored in CloudWatch.

You can view the health by running `mup beanstalk status` or on the [AWS Console](https://console.aws.amazon.com/elasticbeanstalk/home).

## Logs

The log commands shows the last 100 lines. You can download a zip file with all of the logs from the [aws console](https://console.aws.amazon.com/elasticbeanstalk/home).

## Meteor and Node versions

This plugin supports meteor 1.2 or newer. It will automatically use the correct Node and npm version.

## SSL

This plugin can request a certificate for you using the [Amazon Certificate Manager (ACM)](https://aws.amazon.com/certificate-manager/).

In your config, add:

```js
module.exports = {
    app: {
        // ... rest of config

        // Enables SSL. Array of domain names to create the certificate for.
        sslDomains: [
            'website.com',
            'www.website.com',
            'website.net'
        ],

        // (optional) Redirect http to https
        forceSSL: true
    }
};
```

Then run `mup deploy` or `mup beanstalk ssl`.

The command will show a list of email addresses that ACM sent an email to with instructions on verifying the domain name. The list includes your domain's registrant, and administrative and technical contact, as well as a few common addresses.

After you have followed the instructions in the email, run `mup beanstalk ssl` to configure Beanstalk to use the certificate.

You can also run `mup beanstalk ssl` to view the certificate's status or to resend the confirmation email.

ACM automatically renews the certificates.

## Graceful Shutdown

This plugin can setup CloudWatch Events to send a `SIGTERM` signal to your app on instances that are being drained by the load balancer. Your app can listen for this signal and gradually disconnect users or do other work needed before shutting down. The signal is sent at least 30 seconds before before the load balancer finishes draining it.

Before enabling this feature, make sure the IAM user has these policies:

- `IAMFullAccess`
- `AWSCloudTrailFullAccess`
- `CloudWatchEventsFullAccess`
- `AmazonSSMFullAccess`

Next, install the [@meteorjs/ddp-graceful-shutdown](https://github.com/meteor/ddp-graceful-shutdown) npm package and add this code to your app's server:

```ts
import { DDPGracefulShutdown } from '@meteorjs/ddp-graceful-shutdown';
import { Meteor } from 'meteor/meteor';

new DDPGracefulShutdown({
  gracePeriodMillis: 1000 * process.env.METEOR_SIGTERM_GRACE_PERIOD_SECONDS,
  server: Meteor.server,
}).installSIGTERMHandler();
```
`METEOR_SIGTERM_GRACE_PERIOD_SECONDS` is set to 30 seconds.

In your config, set `app.gracefulShutdown` to `true`:
```js
module.exports = {
    app: {
        // ... rest of config

        gracefulShutdown: true
    }
};
```

Then run `mup deploy`.

You can now replace the policies you added with their read only equivilents: `AWSCloudTrailReadOnlyAccess`, `CloudWatchEventsReadOnlyAccess`, `IAMReadOnlyAccess`, and `AmazonSSMReadOnlyAccess`.


## Troubleshooting

- View the logs with `mup logs` or from the AWS Console
- View the environment events with `mup beanstalk events`
- Check the app and instance's health with `mup beanstalk health`
