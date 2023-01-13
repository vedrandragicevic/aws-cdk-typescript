#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CvhamTsStack } from '../lib/cvham_ts-stack';
import { CDKContext } from "../types";

export const getContext = async (app: cdk.App): Promise<CDKContext> => {
  return new Promise(async (resolve, reject) => {
    try {
      const currentBranch = app.node.tryGetContext("currentBranch");
      console.log(`Current git branch: ${currentBranch}`);

      const environment = app.node
        .tryGetContext("environments")
        .find((e: any) => e.branchName === currentBranch);
      console.log(JSON.stringify(environment, null, 2));

      const globals = app.node.tryGetContext("globals");
      console.log("Globals:");
      console.log(JSON.stringify(globals, null, 2));

      return resolve({ ...globals, ...environment });
    } catch (error) {
      console.error(error);
      return reject();
    }
  });
};

// Create Stacks
const createStacks = async () => {
  try {
    const app = new cdk.App();
    const context = await getContext(app);

    const stackProps: cdk.StackProps = {
      env: {
        region: context.region,
        account: context.accountNumber,
      },
      stackName: `${context.environment}-${context.appName}-stack`,
      description: `CDK stack used to instantiate infrastructure for data platform integration for storage gateways`,
    };

    new CvhamTsStack(
      app,
      `${context.environment}-${context.appName}-stack`,
      stackProps,
      context
    );
  } catch (error) {
    console.error(error);
  }
};

createStacks();