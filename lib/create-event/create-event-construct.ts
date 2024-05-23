import { Construct } from "constructs";
import { Stack, RemovalPolicy, Duration, CfnOutput } from "aws-cdk-lib";
import {
  Bucket,
  HttpMethods,
  EventType,
  BlockPublicAccess,
  BucketAccessControl,
} from "aws-cdk-lib/aws-s3";
import { SnsDestination } from "aws-cdk-lib/aws-s3-notifications";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { PolicyStatement, Effect, ArnPrincipal } from "aws-cdk-lib/aws-iam";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Queue } from "aws-cdk-lib/aws-sqs";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { AttributeType, BillingMode, Table } from "aws-cdk-lib/aws-dynamodb";
import { createRekognitionLambdaRole } from "../..//utils/roles-util";
import { Topic } from "aws-cdk-lib/aws-sns";
import { SqsSubscription } from "aws-cdk-lib/aws-sns-subscriptions";
import { isMasterBranch } from "../../utils/git-util";

const EVENTS_RETENTION_DAYS = 180;

interface CreateEventConstructProps {
  usersTable: Table;
  organizationTable: Table;
  organizationAssets: Bucket;
  DEFAULT_LAMBDA_ENV: any;
}
export class CreateEventConstruct extends Construct {
  readonly photosPresignLambda: NodejsFunction;
  readonly createEventLambda: NodejsFunction;
  readonly ProfilePresignLambda: NodejsFunction;
  readonly createResourcesLambda: NodejsFunction;
  readonly verifyNameUrlLambda: NodejsFunction;
  readonly getOrganizationDefaults: NodejsFunction;
  readonly finishUploadLambda: NodejsFunction;
  readonly eventsTable: Table;
  readonly facesTable: Table;
  readonly photoBucket: Bucket;

  constructor(scope: Construct, id: string, props: CreateEventConstructProps) {
    super(scope, id);

    const stack = Stack.of(this);

    const { usersTable, organizationTable, organizationAssets, DEFAULT_LAMBDA_ENV } = props;

    this.eventsTable = new Table(this, "EventsTable", {
      partitionKey: { name: "organization", type: AttributeType.STRING },
      sortKey: { name: "id", type: AttributeType.STRING },
      removalPolicy: RemovalPolicy.DESTROY,
      timeToLiveAttribute: "ttl",
      billingMode: BillingMode.PAY_PER_REQUEST,
    });

    new CfnOutput(this, "EventsTableName", {
      value: this.eventsTable.tableName,
    });

    this.facesTable = new Table(this, "FacesTable", {
      partitionKey: { name: "eventId", type: AttributeType.STRING },
      sortKey: { name: "id", type: AttributeType.STRING },
      removalPolicy: RemovalPolicy.DESTROY,
      timeToLiveAttribute: "ttl",
      billingMode: BillingMode.PAY_PER_REQUEST,
    });

    new CfnOutput(this, "FacesTableName", {
      value: this.facesTable.tableName,
    });

    const createResourcesLambdaRole = createRekognitionLambdaRole(scope, "CreateResourcesRole");

    this.createResourcesLambda = new NodejsFunction(this, "CreateResourcesLambda", {
      runtime: Runtime.NODEJS_18_X,
      entry: "service/lambdas/create-event/create-resources.ts",
      environment: {
        ...DEFAULT_LAMBDA_ENV,
        EVENTS_TABLE_NAME: this.eventsTable.tableName,
        USERS_TABLE_NAME: usersTable.tableName,
        ORGANIZATIONS_TABLE_NAME: organizationTable.tableName,
      },
      memorySize: 256,
      role: createResourcesLambdaRole,
    });
    usersTable.grant(this.createResourcesLambda, "dynamodb:UpdateItem");
    this.eventsTable.grantReadWriteData(this.createResourcesLambda);
    organizationTable.grant(this.createResourcesLambda, "dynamodb:UpdateItem", "dynamodb:GetItem");

    const dynamoDBStatement = new PolicyStatement({
      actions: ["dynamodb:CreateTable", "dynamodb:DescribeTable"],
      resources: ["*"],
    });
    this.createResourcesLambda.addToRolePolicy(dynamoDBStatement);

    this.verifyNameUrlLambda = new NodejsFunction(this, "VerifyNameUrlLambda", {
      runtime: Runtime.NODEJS_18_X,
      entry: "service/lambdas/create-event/verify-name-url.ts",
      environment: {
        ...DEFAULT_LAMBDA_ENV,
        TABLE_NAME: this.eventsTable.tableName,
      },
    });
    this.eventsTable.grantReadData(this.verifyNameUrlLambda);

    this.photoBucket = new Bucket(this, "PhotoBucket", {
      removalPolicy: isMasterBranch() ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
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
      lifecycleRules: [
        {
          expiration: Duration.days(EVENTS_RETENTION_DAYS),
        },
      ],
    });
    new CfnOutput(this, "UrlForObject", {
      value: this.photoBucket.urlForObject(),
    });

    this.photosPresignLambda = new NodejsFunction(this, "GeneratePresignedURLLambda", {
      runtime: Runtime.NODEJS_18_X,
      entry: "service/lambdas/create-event/photo-presign-url.ts",
      environment: {
        ...DEFAULT_LAMBDA_ENV,
        BUCKET_NAME: this.photoBucket.bucketName,
        EVENTS_TABLE_NAME: this.eventsTable.tableName,
      },
      timeout: Duration.seconds(30),
    });

    this.ProfilePresignLambda = new NodejsFunction(this, "ProfilePresignLambda", {
      runtime: Runtime.NODEJS_18_X,
      entry: "service/lambdas/create-event/profile-presign-url.ts",
      environment: {
        ...DEFAULT_LAMBDA_ENV,
        BUCKET_NAME: organizationAssets.bucketName,
        ORGANIZATIONS_TABLE_NAME: organizationTable.tableName,
        USER_TABLE_NAME: usersTable.tableName,
        EVENTS_TABLE_NAME: this.eventsTable.tableName,
      },
    });

    organizationAssets.grantReadWrite(this.ProfilePresignLambda);
    organizationTable.grant(this.ProfilePresignLambda, "dynamodb:UpdateItem");
    this.eventsTable.grant(this.ProfilePresignLambda, "dynamodb:UpdateItem");

    const photosTopic = new Topic(this, "PhotosTopic");
    const profileTopic = new Topic(this, "ProfileTopic");

    const processDlq = new Queue(this, "ProcessDLQ", {
      retentionPeriod: Duration.days(14),
    });
    const resizeDlq = new Queue(this, "ResizeDLQ", {
      retentionPeriod: Duration.days(14),
    });
    const processPhotosQueue = new Queue(this, "ProcessPhotoQueue", {
      visibilityTimeout: Duration.minutes(2),
      deadLetterQueue: {
        queue: processDlq,
        maxReceiveCount: 3,
      },
    });
    const resizePhotosQueue = new Queue(this, "ResizePhotoQueue", {
      visibilityTimeout: Duration.seconds(150),
      deadLetterQueue: {
        queue: resizeDlq,
        maxReceiveCount: 2,
      },
    });

    const resizeProfileQueue = new Queue(this, "ResizeProfileQueue", {
      visibilityTimeout: Duration.seconds(150),
      deadLetterQueue: {
        queue: resizeDlq,
        maxReceiveCount: 2,
      },
    });

    photosTopic.addSubscription(new SqsSubscription(processPhotosQueue));
    photosTopic.addSubscription(new SqsSubscription(resizePhotosQueue));
    profileTopic.addSubscription(new SqsSubscription(resizeProfileQueue));

    this.photoBucket.addEventNotification(
      EventType.OBJECT_CREATED,
      new SnsDestination(photosTopic),
      {
        prefix: "original/",
      }
    );

    organizationAssets.addEventNotification(
      EventType.OBJECT_CREATED,
      new SnsDestination(profileTopic),
      {
        prefix: "organization-assets/original/",
      }
    );

    this.photoBucket.addToResourcePolicy(
      new PolicyStatement({
        actions: ["s3:GetObject"],
        effect: Effect.ALLOW,
        principals: [new ArnPrincipal("*")],
        resources: [this.photoBucket.arnForObjects("*")],
      })
    );

    const processPhotoLambdaRole = createRekognitionLambdaRole(scope, "processPhotoRole");
    const processPhotoLambda = new NodejsFunction(this, "ProcessPhotoLambda", {
      runtime: Runtime.NODEJS_18_X,
      entry: "service/lambdas/create-event/process-photo.ts",
      environment: {
        REGION: stack.region,
        FACES_TABLE_NAME: this.facesTable.tableName,
      },
      role: processPhotoLambdaRole,
      timeout: Duration.seconds(90),
      memorySize: 512,
    });
    processPhotoLambda.addEventSource(
      new SqsEventSource(processPhotosQueue, {
        batchSize: 10,
        maxBatchingWindow: Duration.seconds(10),
      })
    );
    const facesTablesPolicy = new PolicyStatement({
      actions: ["dynamodb:PutItem"],
      resources: [
        `arn:aws:dynamodb:${stack.region}:${stack.account}:table/${this.facesTable.tableName}`,
      ],
    });
    processPhotoLambda.addToRolePolicy(facesTablesPolicy);
    this.photoBucket.grantReadWrite(processPhotoLambda);

    const resizePhotoLambda = new NodejsFunction(this, "ResizePhotoLambda", {
      runtime: Runtime.NODEJS_18_X,
      entry: "service/lambdas/create-event/resize-photo.ts",
      environment: {
        REGION: stack.region,
        EVENTS_TABLE_NAME: this.eventsTable.tableName,
      },
      timeout: Duration.minutes(2),
      memorySize: 2048,
    });
    this.photoBucket.grantReadWrite(resizePhotoLambda);
    organizationAssets.grantReadWrite(resizePhotoLambda);
    this.eventsTable.grant(resizePhotoLambda, "dynamodb:UpdateItem");
    resizePhotoLambda.addEventSource(
      new SqsEventSource(resizePhotosQueue, {
        batchSize: 10,
        maxBatchingWindow: Duration.seconds(5),
      })
    );

    resizePhotoLambda.addEventSource(new SqsEventSource(resizeProfileQueue));

    const s3Permissions = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ["s3:PutObject", "s3:PutObjectAcl"],
      resources: [`${this.photoBucket.bucketArn}/*`],
    });
    this.photosPresignLambda.addToRolePolicy(s3Permissions);

    // this.getOrganizationDefaults = new NodejsFunction(this, "getOrganizationDefaultsLambda", {
    //   runtime: Runtime.NODEJS_18_X,
    //   entry: "service/lambdas/organization/get-organization-defaults.ts",
    //   environment: {
    //     ...DEFAULT_LAMBDA_ENV,
    //     ORGANIZATIONS_TABLE_NAME: organizationTable.tableName,
    //   },
    //   timeout: Duration.seconds(5),
    // });
    // organizationTable.grant(this.getOrganizationDefaults, "dynamodb:GetItem");

    this.finishUploadLambda = new NodejsFunction(this, "FinishUploadLambda", {
      runtime: Runtime.NODEJS_18_X,
      entry: "service/lambdas/create-event/finish-upload.ts",
      environment: {
        ...DEFAULT_LAMBDA_ENV,
        EVENTS_TABLE_NAME: this.eventsTable.tableName,
      },
    });
    this.eventsTable.grant(this.finishUploadLambda, "dynamodb:UpdateItem");
  }
}
