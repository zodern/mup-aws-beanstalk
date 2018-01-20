import { expect } from 'chai';
import { mergeConfigs } from '../src/eb-config';

describe('mergeConfigs', () => {
  it('should merge configs', () => {
    const expected = [
      {
        Namespace: 'aws:autoscaling:updatepolicy:rollingupdate',
        OptionName: 'RollingUpdateType',
        Value: 'NewValue'
      },
      {
        Namespace: 'aws:elasticbeanstalk:healthreporting:system',
        OptionName: 'SystemType',
        Value: 'enhanced'
      },
      {
        Namespace: 'aws:autoscaling:updatepolicy:rollingupdate',
        OptionName: 'RollingUpdateEnabled',
        Value: 'true'
      }
    ];
    const config1 = [
      {
        Namespace: 'aws:autoscaling:updatepolicy:rollingupdate',
        OptionName: 'RollingUpdateType',
        Value: 'Health'
      },
      {
        Namespace: 'aws:autoscaling:updatepolicy:rollingupdate',
        OptionName: 'RollingUpdateEnabled',
        Value: 'true'
      }
    ];
    const config2 = [
      {
        Namespace: 'aws:autoscaling:updatepolicy:rollingupdate',
        OptionName: 'RollingUpdateType',
        Value: 'NewValue'
      }, {
        Namespace: 'aws:elasticbeanstalk:healthreporting:system',
        OptionName: 'SystemType',
        Value: 'enhanced'
      }
    ];
    const result = mergeConfigs(config1, config2);

    expect(result).to.have.deep.members(expected);
  });
});
