import { ContextProvider, Duration } from "aws-cdk-lib";
import { LambdaDefinition } from "../type";
import { CDKContext } from "../type";
import { NodejsFunctionProps } from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';

// Consts
const DEFAULT_LAMBDA_MEMORY_MB = 1024;
const DEFAULT_LAMBDA_TIMEOUT_MINS = 15;

// Returns lambda definitions with custom env
export const getLambdaDefinitions = (context: CDKContext): LambdaDefinition[] => {
    const lambdaDefinitions: LambdaDefinition[] = [
        {
            name: 'public-function',
            environment: {
                REGION: context.region,
                ENV: context.environment,
                GIT_BRANCH: context.branchName
            },
            isPrivate: false,
        },
        {
            name: 'private-function',
            memoryMB: 2048,
            timeoutMins: 5,
            environment: {
                REGION: context.region,
                ENV: context.environment,
                GIT_BRANCH: context.branchName
            },
            isPrivate: true
        }
    ];
    return lambdaDefinitions;
}

// Returns Lambda Function properties with defaults and overwrites
// https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_lambda_nodejs.NodejsFunctionProps.html
export const getFunctionProps = (
    lambdaDefinition: LambdaDefinition,
    lambdaRole: iam.Role,
    lambdaLayer: lambda.LayerVersion,
    context: CDKContext
  ): NodejsFunctionProps => {
    const functionProps: NodejsFunctionProps = {
      functionName: `${context.appName}-${lambdaDefinition.name}-${context.environment}`,
      entry: `lambda-handlers/${lambdaDefinition.name}.ts`,
      runtime: lambda.Runtime.NODEJS_14_X,
      memorySize: lambdaDefinition.memoryMB ? lambdaDefinition.memoryMB : DEFAULT_LAMBDA_MEMORY_MB,
      timeout: lambdaDefinition.timeoutMins ? Duration.minutes(15) : Duration.minutes(DEFAULT_LAMBDA_TIMEOUT_MINS),
      environment: lambdaDefinition.environment,
      role: lambdaRole,
      layers: [lambdaLayer],
    };
    return functionProps;
  };