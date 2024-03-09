import { Stack, StackProps, RemovalPolicy, CfnOutput } from "aws-cdk-lib";
import { AttributeType, BillingMode, Table } from "aws-cdk-lib/aws-dynamodb";
import { BlockPublicAccess, Bucket, BucketAccessControl, HttpMethods } from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import { TommyCognito } from "./cognito/tommy-cognito";
import { AuthConstruct } from "./auth/auth-construct";
import { Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";

export class ServerlessProjectStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
  }

  async init() {
    const stack = Stack.of(this);
    const region = stack.region;

    const lambdaRole = new Role(this, "LambdaExecutionRole", {
      assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
    });

    const memberAssets = new Bucket(this, "MemberAssets", {
      removalPolicy: RemovalPolicy.DESTROY,
      cors: [
        {
          allowedMethods: [HttpMethods.GET, HttpMethods.PUT],
          allowedOrigins: ["*"],
          allowedHeaders: ["*"],
          maxAge: 3000,
        },
      ],
      blockPublicAccess: BlockPublicAccess.BLOCK_ACLS,
      accessControl: BucketAccessControl.BUCKET_OWNER_FULL_CONTROL,
    });

    new CfnOutput(this, "MemberAssetsBucketUrl", {
      value: memberAssets.urlForObject(),
    });

    const usersTable = new Table(this, "UsersTable", {
      partitionKey: { name: "email", type: AttributeType.STRING },
      sortKey: { name: "id", type: AttributeType.STRING },
      removalPolicy: RemovalPolicy.DESTROY,
      billingMode: BillingMode.PAY_PER_REQUEST,
    });
    new CfnOutput(this, "UsersTableName", {
      value: usersTable.tableName,
    });

    const membersTable = new Table(this, "MembersTable", {
      partitionKey: { name: "id", type: AttributeType.STRING },
      removalPolicy: RemovalPolicy.DESTROY,
      billingMode: BillingMode.PAY_PER_REQUEST,
    });
    new CfnOutput(this, "MembersTableName", {
      value: membersTable.tableName,
    });

    const giftsTable = new Table(this, "Gifts", {
      partitionKey: { name: "email", type: AttributeType.STRING },
      sortKey: { name: "id", type: AttributeType.NUMBER },
      removalPolicy: RemovalPolicy.DESTROY,
      billingMode: BillingMode.PAY_PER_REQUEST,
    });
    new CfnOutput(this, "GiftsTableName", {
      value: giftsTable.tableName,
    });
    giftsTable.addGlobalSecondaryIndex({
      indexName: "root-index",
      partitionKey: { name: "root", type: AttributeType.STRING },
      sortKey: { name: "id", type: AttributeType.NUMBER },
    });

    const cognitoConstruct = new TommyCognito(this, "CognitoConstruct", {
      usersTable,
    });

    const DEFAULT_LAMBDA_ENV = {
      USER_POOL_ID: cognitoConstruct.userPoolId,
      CLIENT_APP_ID: cognitoConstruct.clientAppId,
      REGION: region,
      DEPLOY_ENV: process.env.DEPLOY_ENV,
    };

    const auth = new AuthConstruct(this, "AuthConstruct", {
      usersTable,
      membersTable,
      giftsTable,
      userPoolId: cognitoConstruct.userPoolId,
      DEFAULT_LAMBDA_ENV,
    });

    new CfnOutput(this, "ApiGatewayId", {
      value: auth.authApi.url,
      exportName: "ApiGatewayId",
    });
    new CfnOutput(this, "restApiId", {
      value: auth.authApi.restApiId,
      exportName: "restApiId",
    });
  }
}
