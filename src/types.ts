import { ListBucketsCommandOutput } from '@aws-sdk/client-s3';

export type Env = {
  PORT?: number;
  METEOR_SIGTERM_GRACE_PERIOD_SECONDS?: number,
  [key: string]: any;
}

export type MupAwsConfig = {
  name: string;
  path: string;
  type: string;
  envName: string;
  envType: 'webapp' | 'worker';
  buildOptions: {
    buildLocation: string;
    serverOnly?: boolean;
    debug?: boolean;
    mobileSettings?: {
    };
    server?: string;
    allowIncompatibleUpdates?: boolean;
    executable?: string;
  };
  docker?: {
  };
  env: Env;
  auth: {
    id: string;
    secret: string;
  };
  sslDomains?: Array<string>;
  forceSSL?: boolean;
  region: string;
  minInstances: number;
  maxInstances: number;
  streamLogs?: boolean;
  instanceType: string;
  gracefulShutdown?: boolean;
  longEnvVars?: boolean;
  yumPackages?: {
    [key: string]: string;
  };
  oldVersions: number;
  customBeanstalkConfig?: Array<{
    namespace: string;
    option: string;
    value: string;
  }>;
  sshKey?: {
    privateKey: string;
    publicKey: string;
  };
};

export type MeteorSettings = {
  [key: string]: any;
};

export type MupConfig = {
  app: MupAwsConfig;
}

export type MupUtils = {
  combineErrorDetails: (details: Array<any>, result: any) => Array<any>;
  addLocation: (details: Array<any>, location: string) => Array<any>;
  VALIDATE_OPTIONS: {};
  forwardPort: (args: {
    server: {
      host: string,
      port: number,
      username: string,
      password?: string,
      pem: string,
    },
    localAddress: string,
    localPort: number,
    remoteAddress: string,
    remotePort: number,
    onReady: () => void,
    onError: (err: Error) => void,
    onConnection: () => void
  }) => void
  resolvePath: (...args: string[]) => string;
  getBasePath: () => string;
};

export type MupApi = {
  verbose: boolean;
  getConfig: () => MupConfig;
  getSettings: () => MeteorSettings;
  getOptions: () => {
    'cached-build': boolean;
  };
  getArgs: () => string[];
  runCommand: (command: string, args?: Array<string>) => Promise<void>;
  commandHistory: {
    name: string
  }[];
  forwardPort: MupUtils['forwardPort'];
  resolvePath: MupUtils['resolvePath'];
  getBasePath: MupUtils['getBasePath'];
};

export type Buckets = Exclude<ListBucketsCommandOutput['Buckets'], undefined>

export type EBConfigElement = {
  Namespace: string;
  OptionName: string;
  Value: string;
  ResourceName?: string;
}

export type EBConfigDictionary = {
  [key: string]: EBConfigElement;
}
