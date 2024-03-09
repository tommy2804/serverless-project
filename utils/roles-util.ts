import { Stack } from 'aws-cdk-lib';
import { ManagedPolicy, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

const createLambdaBasicRole = (scope: Construct, id: string): Role =>
  new Role(scope, id, {
    assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
    managedPolicies: [
      ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
    ],
  });

const createCognitoPolicyFunction =
  (region: string, account: string, userpoolId: string): ((actions: string[]) => PolicyStatement) =>
  (actions: string[]) =>
    new PolicyStatement({
      actions: actions.map((action) => `cognito-idp:${action}`),
      resources: [`arn:aws:cognito-idp:${region}:${account}:userpool/${userpoolId}`],
    });

const createRekognitionLambdaRole = (scope: Construct, id: string): Role => {
  const rekognitionRole = createLambdaBasicRole(scope, id);
  rekognitionRole.addManagedPolicy(
    ManagedPolicy.fromAwsManagedPolicyName('AmazonRekognitionFullAccess'),
  );
  return rekognitionRole;
};

const getTablePolicy = (stack: Stack, tableName: string, actions: string[]): PolicyStatement =>
  new PolicyStatement({
    actions: actions,
    resources: [`arn:aws:dynamodb:${stack.region}:${stack.account}:table/${tableName}`],
  });

export {
  createLambdaBasicRole,
  createCognitoPolicyFunction,
  createRekognitionLambdaRole,
  getTablePolicy,
};
