#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import * as dotenv from "dotenv";
import { ServerlessProjectStack } from "../lib/serverless-project-stack";
import { userInfo } from "os";
import { getCurrentGitBranch } from "../utils/git-util";

dotenv.config();

const app = new cdk.App();
const serverlessProject = new ServerlessProjectStack(
  app,
  `${userInfo().username}${getCurrentGitBranch()}ServerlessProjectStack`,
  {
    env: {
      region: process.env.REGION || "eu-central-1",
    },
  }
);

serverlessProject.init();
