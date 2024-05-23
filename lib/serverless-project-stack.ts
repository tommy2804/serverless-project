import { Stack, StackProps, RemovalPolicy, CfnOutput } from "aws-cdk-lib";
import { AttributeType, BillingMode, Table } from "aws-cdk-lib/aws-dynamodb";
import { BlockPublicAccess, Bucket, BucketAccessControl, HttpMethods } from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import { TommyCognito } from "./cognito/tommy-cognito";
import { AuthConstruct } from "./auth/auth-construct";
import { Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { AuthorizationType, CfnAuthorizer, Cors, RestApi } from "aws-cdk-lib/aws-apigateway";
import { createApiResource } from "../utils/api";
import { CreateEventConstruct } from "./create-event/create-event-construct";
import { ManageEventsConstruct } from "./manage-events/manage-events-construct";

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

    const organizationAssets = new Bucket(this, "OrganizationAssets", {
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

    new CfnOutput(this, "OrganizationAssetsBucketUrl", {
      value: organizationAssets.urlForObject(),
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

    const organizationTable = new Table(this, "OrganizationTable", {
      partitionKey: { name: "id", type: AttributeType.STRING },
      removalPolicy: RemovalPolicy.DESTROY,
      billingMode: BillingMode.PAY_PER_REQUEST,
    });
    new CfnOutput(this, "OrganizationTableName", {
      value: organizationTable.tableName,
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

    const authConstruct = new AuthConstruct(this, "AuthConstruct", {
      usersTable,
      organizationTable,
      giftsTable,
      userPoolId: cognitoConstruct.userPoolId,
      DEFAULT_LAMBDA_ENV,
    });

    const createEventConstruct = new CreateEventConstruct(this, "CreateEventConstruct", {
      usersTable,
      organizationTable,
      organizationAssets,
      DEFAULT_LAMBDA_ENV,
    });

    const manageEventsConstruct = new ManageEventsConstruct(this, "ManageEventsConstruct", {
      eventsTable: createEventConstruct.eventsTable,
      organizationTable,
      facesTable: createEventConstruct.facesTable,
      photosBucket: createEventConstruct.photoBucket,
      organizationAssets,
      DEFAULT_LAMBDA_ENV,
    });

    const serviceApi = new RestApi(this, "ServiceEndpoints", {
      defaultCorsPreflightOptions: {
        allowOrigins: Cors.ALL_ORIGINS,
        allowMethods: Cors.ALL_METHODS,
      },
    });

    const cognitoAuthorizer = new CfnAuthorizer(this, "MyCognitoAuthorizer", {
      name: "service-authorizer",
      restApiId: serviceApi.restApiId,
      type: "COGNITO_USER_POOLS",
      identitySource: "method.request.header.Authorization",
      providerArns: [cognitoConstruct.userPoolArn],
      authType: "cognito_user_pools",
    });

    const authorizer = {
      authorizerId: cognitoAuthorizer.ref,
      authorizationType: AuthorizationType.COGNITO,
    };

    const apiRoute = serviceApi.root.addResource("api");
    const authRoute = apiRoute.addResource("auth");
    const eventsRoute = apiRoute.addResource("events");
    const organizationRoute = apiRoute.addResource("organization");
    const guestsRoute = apiRoute.addResource("guests");
    // const paymentsRoute = apiRoute.addResource("payments");
    // ************* manage event routes ************* //
    createApiResource(
      guestsRoute,
      "GET",
      manageEventsConstruct.getPhotosPublicLambda,
      "get-photos"
    );
    createApiResource(
      eventsRoute,
      "POST",
      manageEventsConstruct.addImageToEventLambda,
      "add-images",
      authorizer
    );
    createApiResource(eventsRoute, "PUT", manageEventsConstruct.updateEventLambda, "", authorizer);
    createApiResource(eventsRoute, "GET", manageEventsConstruct.getEeventsLambda, "", authorizer);
    createApiResource(
      eventsRoute,
      "GET",
      manageEventsConstruct.getSingleEventLambda,
      "{nameUrl}",
      authorizer
    );
    createApiResource(
      eventsRoute,
      "GET",
      manageEventsConstruct.getEventRandomPhotosLambda,
      "get-event-random-photos",
      authorizer
    );
    createApiResource(
      eventsRoute,
      "DELETE",
      manageEventsConstruct.deleteEventLambda,
      "",
      authorizer
    );
    createApiResource(
      eventsRoute,
      "POST",
      manageEventsConstruct.setEventFavoritePhotosLambda,
      "set-favorite-photos",
      authorizer
    );
    createApiResource(
      eventsRoute,
      "GET",
      manageEventsConstruct.getEventPhotosLambda,
      "get-photos",
      authorizer
    );
    createApiResource(
      apiRoute,
      "POST",
      manageEventsConstruct.createShareQrCodeLambda,
      "create-qrcode",
      authorizer
    );
    // ************* create events routes  ************* //
    createApiResource(
      eventsRoute,
      "POST",
      createEventConstruct.createResourcesLambda,
      "",
      authorizer
    );
    createApiResource(
      eventsRoute,
      "GET",
      createEventConstruct.verifyNameUrlLambda,
      "verify-name-url",
      authorizer
    );
    createApiResource(
      eventsRoute,
      "POST",
      createEventConstruct.finishUploadLambda,
      "finish-upload",
      authorizer
    );
    // createApiResource(
    //   organizationRoute,
    //   "GET",
    //   createEventConstruct.getOrganizationDefaults,
    //   "{organization}"
    // );
    createApiResource(
      apiRoute,
      "POST",
      createEventConstruct.photosPresignLambda,
      "photos-presign-url",
      authorizer
    );
    createApiResource(
      apiRoute,
      "POST",
      createEventConstruct.ProfilePresignLambda,
      "profile-presign-url",
      authorizer
    );

    // ************* auth routes  ************* //
    createApiResource(authRoute, "POST", authConstruct.signUpLambda, "signUp");
    createApiResource(authRoute, "POST", authConstruct.signInLambda, "signIn");
    createApiResource(authRoute, "POST", authConstruct.verifyEmailLambda, "verifyEmail");
    createApiResource(
      authRoute,
      "POST",
      authConstruct.forceChangePasswordLambda,
      "forceChangePassword"
    );
    createApiResource(
      authRoute,
      "POST",
      authConstruct.resendConfirmationCodeLambda,
      "resendConfirmationCode"
    );
    createApiResource(authRoute, "POST", authConstruct.forgotPasswordLambda, "forgotPassword");
    createApiResource(authRoute, "POST", authConstruct.resetPasswordLambda, "resetPassword");
    createApiResource(
      authRoute,
      "POST",
      authConstruct.resetPasswordAuthLambda,
      "resetPasswordAuth",
      authorizer
    );
    createApiResource(authRoute, "GET", authConstruct.signOutLambda, "signOut", authorizer);
    createApiResource(authRoute, "GET", authConstruct.refreshTokenCodeLambda, "refreshToken");
    createApiResource(
      authRoute,
      "GET",
      authConstruct.getUserDetailsLambda,
      "getUserDetails",
      authorizer
    );
    createApiResource(authRoute, "GET", authConstruct.isLoggedInLambda, "isLoggedIn", authorizer);
  }
}
