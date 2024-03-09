import { Construct } from 'constructs';
import { CfnRuleGroup, CfnWebACL, CfnWebACLAssociation } from 'aws-cdk-lib/aws-wafv2';
import { RestApi } from 'aws-cdk-lib/aws-apigateway';

export class TommyWafConstruct extends Construct {
  readonly waf: CfnWebACL;
  readonly originvVerifyRule: CfnRuleGroup.RuleProperty;
  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.originvVerifyRule = {
      name: 'OriginVerifyRule',
      priority: 0,
      statement: {
        byteMatchStatement: {
          searchString: '1234',
          fieldToMatch: {
            singleHeader: {
              Name: 'x-origin-verify',
            },
          },
          positionalConstraint: 'EXACTLY',
          textTransformations: [
            {
              priority: 0,
              type: 'NONE',
            },
          ],
        },
      },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: 'x-origin-verify-header',
        sampledRequestsEnabled: true,
      },
      action: {
        allow: {},
      },
    };

    this.waf = new CfnWebACL(this, 'TommyWaf', {
      scope: 'REGIONAL',
      defaultAction: {
        block: {},
      },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: 'MyRuleGroupMetrics',
        sampledRequestsEnabled: true,
      },
      rules: [this.originvVerifyRule],
    });
  }

  public applyWafToApiGw(scope: Construct, apigw: RestApi, name: string) {
    const waf = new CfnWebACL(this, `TommyWaf${name}`, {
      scope: 'REGIONAL',
      defaultAction: {
        block: {},
      },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: 'MyRuleGroupMetrics',
        sampledRequestsEnabled: true,
      },
      rules: [this.originvVerifyRule],
    });
    const apiGatewayArn = `arn:aws:apigateway:${apigw.stack.region}::/restapis/${apigw.restApiId}/stages/${apigw.deploymentStage.stageName}`;
    new CfnWebACLAssociation(scope, `Waf${name}ApiGwAssociation`, {
      webAclArn: waf.attrArn,
      resourceArn: apiGatewayArn,
    });
  }
}
