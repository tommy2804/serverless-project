import { CfnOutput, Duration, Stack } from "aws-cdk-lib";
import { Construct } from "constructs";
import { RestApi, Cors, CfnAuthorizer, AuthorizationType } from "aws-cdk-lib/aws-apigateway";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { runtime } from "../../service/constants";
import { createApiResource } from "./../../utils/api";
import {
  createCognitoPolicyFunction,
  createLambdaBasicRole,
  getTablePolicy,
} from "../../utils/roles-util";
import { Table } from "aws-cdk-lib/aws-dynamodb";

interface AuthConstructProps {
  usersTable: Table;
  membersTable: Table;
  giftsTable: Table;
  userPoolId: string;
  DEFAULT_LAMBDA_ENV: any;
}

export class AuthConstruct extends Construct {
  public readonly authApi: RestApi;
  public readonly authorizer: CfnAuthorizer;
  public readonly signUpLambda: NodejsFunction;
  public readonly signInLambda: NodejsFunction;
  public readonly signOutLambda: NodejsFunction;
  public readonly refreshLambda: NodejsFunction;
  public readonly getUserLambda: NodejsFunction;
  public readonly getUserGiftsLambda: NodejsFunction;
  public readonly getUserMembersLambda: NodejsFunction;
  public readonly getUserGiftsForMemberLambda: NodejsFunction;

  constructor(scope: Construct, id: string, authConstructProps: AuthConstructProps) {
    super(scope, id);
    const stack = Stack.of(this);

    const { usersTable, membersTable, giftsTable, userPoolId, DEFAULT_LAMBDA_ENV } =
      authConstructProps;

    const USERS_TABLE_NAME = usersTable.tableName;
    const MEMBERS_TABLE_NAME = membersTable.tableName;
    const GIFT_EVENTS_TABLE_NAME = giftsTable.tableName;

    const userPoolArn = `arn:aws:cognito-idp:${stack.region}:${stack.account}:userpool/${userPoolId}`;

    const createCognitoPolicy = createCognitoPolicyFunction(
      stack.region,
      stack.account,
      userPoolId
    );

    const signInLambdRole = createLambdaBasicRole(this, "SignInLambdaRole");
    signInLambdRole.addToPolicy(createCognitoPolicy(["AdminGetUser", "AdminUserGlobalSignOut"]));

    const signUpLambda = new NodejsFunction(this, "SignUp", {
      runtime,
      entry: "service/lambdas/auth/signup.ts",
      environment: {
        ...DEFAULT_LAMBDA_ENV,
        USERS_TABLE_NAME: USERS_TABLE_NAME,
        MEMBERS_TABLE_NAME: MEMBERS_TABLE_NAME,
      },
      memorySize: 256,
      timeout: Duration.seconds(30),
      role: signInLambdRole,
    });

    const putUsers = getTablePolicy(stack, USERS_TABLE_NAME, [
      "dynamodb:PutItem",
      "dynamodb:readItem",
    ]);
    const putMembers = getTablePolicy(stack, MEMBERS_TABLE_NAME, [
      "dynamodb:PutItem",
      "dynamodb:readItem",
    ]);
    signUpLambda.addToRolePolicy(putUsers);
    signUpLambda.addToRolePolicy(putMembers);

    const signInLambda = new NodejsFunction(this, "SignIn", {
      runtime,
      entry: "service/lambdas/auth/signin.ts",
      environment: {
        ...DEFAULT_LAMBDA_ENV,
      },
      memorySize: 256,
      timeout: Duration.seconds(30),
      role: signInLambdRole,
    });

    const forceChangePasswordLambdRole = createLambdaBasicRole(
      this,
      "forceChangePasswordLambdaRole"
    );
    forceChangePasswordLambdRole.addToPolicy(
      createCognitoPolicy(["AdminGetUser", "AdminInitiateAuth", "AdminRespondToAuthChallenge"])
    );

    const forceChangePasswordLambda = new NodejsFunction(this, "ForceChangePassword", {
      runtime,
      entry: "service/lambdas/auth/forceChangePassword.ts",
      environment: {
        ...DEFAULT_LAMBDA_ENV,
        USERS_TABLE_NAME: USERS_TABLE_NAME,
      },
      memorySize: 256,
      timeout: Duration.seconds(30),
      role: forceChangePasswordLambdRole,
    });
    const updateUserstTable = getTablePolicy(stack, USERS_TABLE_NAME, ["dynamodb:UpdateItem"]);
    forceChangePasswordLambda.addToRolePolicy(updateUserstTable);

    const isLoggedInLambda = new NodejsFunction(this, "IsLoggedIn", {
      runtime,
      entry: "service/lambdas/auth/isLoggedIn.ts",
      environment: {
        ...DEFAULT_LAMBDA_ENV,
        GIFT_EVENTS_TABLE_NAME: GIFT_EVENTS_TABLE_NAME,
      },
      memorySize: 256,
    });
    const queryGiftsTable = getTablePolicy(stack, GIFT_EVENTS_TABLE_NAME, ["dynamodb:Query"]);
    isLoggedInLambda.addToRolePolicy(queryGiftsTable);

    const verifyEmailLambda = new NodejsFunction(this, "VerifyEmail", {
      runtime,
      entry: "service/lambdas/auth/verifyEmail.ts",
      environment: {
        ...DEFAULT_LAMBDA_ENV,
        TABLE_NAME: USERS_TABLE_NAME,
      },
      memorySize: 256,
      timeout: Duration.seconds(10),
    });

    const resendConfirmationCodeLambdaRole = createLambdaBasicRole(
      this,
      "ResendConfirmationCodeLambdaRole"
    );
    resendConfirmationCodeLambdaRole.addToPolicy(createCognitoPolicy(["ResendConfirmationCode"]));

    const resendConfirmationCodeLambda = new NodejsFunction(this, "ResendConfirmationCode", {
      runtime,
      entry: "service/lambdas/auth/resendConfirmationCode.ts",
      environment: {
        ...DEFAULT_LAMBDA_ENV,
      },
      role: resendConfirmationCodeLambdaRole,
    });

    const forgotPasswordLambda = new NodejsFunction(this, "ForgotPassword", {
      runtime,
      entry: "service/lambdas/auth/forgotPassword.ts",
      environment: {
        ...DEFAULT_LAMBDA_ENV,
      },
    });

    const resetPasswordLambda = new NodejsFunction(this, "ResetPassword", {
      runtime,
      entry: "service/lambdas/auth/resetPassword.ts",
      environment: {
        ...DEFAULT_LAMBDA_ENV,
      },
    });

    const resetPasswordAuthLambda = new NodejsFunction(this, "ResetPasswordAuth", {
      runtime,
      entry: "service/lambdas/auth/resetPasswordAuth.ts",
      environment: {
        ...DEFAULT_LAMBDA_ENV,
      },
    });

    const refreshTokenCodeLambdaRole = createLambdaBasicRole(this, "RefreshTokenLambdaRole");
    refreshTokenCodeLambdaRole.addToPolicy(createCognitoPolicy(["AdminUserGlobalSignOut"]));

    const refreshTokenCodeLambda = new NodejsFunction(this, "RefreshToken", {
      runtime,
      entry: "service/lambdas/auth/refreshToken.ts",
      environment: {
        ...DEFAULT_LAMBDA_ENV,
      },
      memorySize: 256,
      role: refreshTokenCodeLambdaRole,
    });

    const getUserDetailsLambda = new NodejsFunction(this, "GetUserDetails", {
      runtime,
      entry: "service/lambdas/auth/get-cognito-details.ts",
      environment: {
        ...DEFAULT_LAMBDA_ENV,
      },
    });

    const verifyPhoneLambda = new NodejsFunction(this, "VerifyPhone", {
      runtime,
      entry: "service/lambdas/auth/verify-phone.ts",
      environment: {
        ...DEFAULT_LAMBDA_ENV,
      },
    });

    const signOutLambdaRole = createLambdaBasicRole(this, "SignOutLambdaRole");
    signOutLambdaRole.addToPolicy(createCognitoPolicy(["AdminUserGlobalSignOut"]));

    const signOutLambda = new NodejsFunction(this, "SignOut", {
      runtime,
      entry: "service/lambdas/auth/signOut.ts",
      environment: {
        ...DEFAULT_LAMBDA_ENV,
      },
      role: signOutLambdaRole,
    });

    this.authApi = new RestApi(this, "AuthEndpoints", {
      defaultCorsPreflightOptions: {
        allowOrigins: Cors.ALL_ORIGINS,
        allowMethods: Cors.ALL_METHODS,
      },
    });

    const cognitoAuthorizer = new CfnAuthorizer(this, "AuthServiceAuthorizer", {
      name: "auth-service-authorizer",
      restApiId: this.authApi.restApiId,
      type: "COGNITO_USER_POOLS",
      identitySource: "method.request.header.Authorization",
      providerArns: [userPoolArn],
      authType: "cognito_user_pools",
    });
    const authorizer = {
      authorizerId: cognitoAuthorizer.ref,
      authorizationType: AuthorizationType.COGNITO,
    };

    const smsMfaLambda = new NodejsFunction(this, "SmsMfa", {
      runtime,
      entry: "service/lambdas/auth/sms-mfa.ts",
      environment: {
        ...DEFAULT_LAMBDA_ENV,
      },
    });

    const updateMfaLambda = new NodejsFunction(this, "UpdateMfa", {
      runtime,
      entry: "service/lambdas/auth/update-mfa.ts",
      environment: {
        ...DEFAULT_LAMBDA_ENV,
      },
    });

    const updatePhoneLambda = new NodejsFunction(this, "UpdatePhone", {
      runtime,
      entry: "service/lambdas/auth/update-phone.ts",
      environment: {
        ...DEFAULT_LAMBDA_ENV,
      },
    });
    // wafConstruct.applyWafToApiGw(this, authApi, "Auth");
    const authRoute = this.authApi.root.addResource("auth");
    createApiResource(authRoute, "POST", signUpLambda, "signUp");
    createApiResource(authRoute, "POST", signInLambda, "signIn");
    createApiResource(authRoute, "POST", verifyEmailLambda, "verifyEmail");
    createApiResource(authRoute, "POST", forceChangePasswordLambda, "forceChangePassword");
    createApiResource(authRoute, "POST", resendConfirmationCodeLambda, "resendConfirmationCode");
    createApiResource(authRoute, "POST", forgotPasswordLambda, "forgotPassword");
    createApiResource(authRoute, "POST", resetPasswordLambda, "resetPassword");
    createApiResource(authRoute, "POST", resetPasswordAuthLambda, "resetPasswordAuth", authorizer);
    createApiResource(authRoute, "GET", signOutLambda, "signOut", authorizer);
    createApiResource(authRoute, "GET", refreshTokenCodeLambda, "refreshToken");
    createApiResource(authRoute, "GET", getUserDetailsLambda, "getUserDetails", authorizer);
    createApiResource(authRoute, "GET", isLoggedInLambda, "isLoggedIn", authorizer);
    // createApiResource(authRoute, 'POST', smsMfaLambda, 'smsMfa');
    // createApiResource(authRoute, 'POST', updateMfaLambda, 'updateMfa', authorizer);
    // createApiResource(authRoute, 'POST', updatePhoneLambda, 'updatePhone', authorizer);
    // createApiResource(authRoute, 'POST', verifyPhoneLambda, 'verifyPhone', authorizer);
  }
}
