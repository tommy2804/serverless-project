import { CfnOutput, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Stack } from 'aws-cdk-lib';
import {
  CustomAttributeConfig,
  UserPool,
  UserPoolEmail,
  UserPoolClient,
  VerificationEmailStyle,
  Mfa,
} from 'aws-cdk-lib/aws-cognito';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { emailVerificationTemplate } from './email-verification-template';
import { createUserTemplate } from './create-user-template';

interface IProps {
  usersTable: Table;
}

const noReplyEmail = 'no-reply@tommy.dev';

export class TommyCognito extends Construct {
  readonly userPoolId: string;
  readonly userPoolArn: string;
  readonly clientAppId: string;
  readonly preTokenGenerationLambda: NodejsFunction;

  constructor(scope: Construct, id: string, props: IProps) {
    super(scope, id);

    const stack = Stack.of(this);
    const { usersTable } = props;

    this.preTokenGenerationLambda = new NodejsFunction(this, 'PreTokenGeneration', {
      runtime: Runtime.NODEJS_18_X,
      entry: 'service/lambdas/authentication/preTokenGeneration.ts',
      timeout: Duration.seconds(5),
      environment: {
        USERS_TABLE_NAME: usersTable.tableName,
        REGION: stack.region,
      },
    });
    usersTable.grant(this.preTokenGenerationLambda, 'dynamodb:GetItem');

    const userPool = new UserPool(stack, 'MyUserPool', {
      selfSignUpEnabled: true,
      userVerification: {
        emailSubject: 'Verify your email for Izme!',
        emailBody: emailVerificationTemplate,
        emailStyle: VerificationEmailStyle.CODE,
      },
      userInvitation: {
        emailSubject: 'Invite to join Izme!',
        emailBody: createUserTemplate,
      },
      autoVerify: {
        email: true,
        phone: true,
      },
      mfa: Mfa.OPTIONAL,
      mfaSecondFactor: {
        sms: true,
        otp: false,
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      lambdaTriggers: {
        preTokenGeneration: this.preTokenGenerationLambda,
      },
      email: UserPoolEmail.withCognito(noReplyEmail),
      customAttributes: {
        root: {
          bind(): CustomAttributeConfig {
            return {
              dataType: 'Boolean',
              mutable: false,
            };
          },
        },
        organization: {
          bind(): CustomAttributeConfig {
            return {
              dataType: 'String',
              mutable: false,
            };
          },
        },
        expiration: {
          bind(): CustomAttributeConfig {
            return {
              dataType: 'DateTime',
              mutable: true,
            };
          },
        },
        permissions: {
          bind(): CustomAttributeConfig {
            return {
              dataType: 'String',
              mutable: true,
            };
          },
        },
      },
    });

    this.userPoolId = userPool.userPoolId;
    this.userPoolArn = userPool.userPoolArn;

    const userPoolClient = new UserPoolClient(stack, 'MyUserPoolClient', {
      userPool,
      generateSecret: false,
      authFlows: {
        userSrp: true,
        userPassword: true,
        adminUserPassword: true,
      },
    });
    this.clientAppId = userPoolClient.userPoolClientId;
    new CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
    });
    new CfnOutput(this, 'ClientAppId', {
      value: userPoolClient.userPoolClientId,
    });

    userPoolClient.node.addDependency(userPool);
  }
}
