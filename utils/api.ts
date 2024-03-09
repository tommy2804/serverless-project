import { LambdaIntegration, Resource, IAuthorizer } from 'aws-cdk-lib/aws-apigateway';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';

export const createApiResource = (
  originResource: Resource,
  method: 'POST' | 'PUT' | 'GET' | 'DELETE',
  lambda: NodejsFunction,
  resourcePath?: string,
  authorizer?: IAuthorizer,
): void => {
  const additionalProps = authorizer && { authorizer };
  const resource = resourcePath ? originResource.addResource(resourcePath) : originResource;
  resource.addMethod(method, new LambdaIntegration(lambda), additionalProps);
};
