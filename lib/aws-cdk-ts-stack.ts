import { RemovalPolicy, Stack, StackProps, Tags} from 'aws-cdk-lib';
import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import { aws_ec2 as ec2 } from "aws-cdk-lib";
import { aws_lambda as lambda } from "aws-cdk-lib";
import { aws_iam as iam } from "aws-cdk-lib";
import { aws_secretsmanager as secretsmanager } from "aws-cdk-lib";
import { CDKContext } from '../type';
import { getFunctionProps, getLambdaDefinitions } from './lambda-config';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as cwLogs from 'aws-cdk-lib/aws-logs';


export class AwsCdkTsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: cdk.StackProps, context: CDKContext) {
    super(scope, id, props);

    // Add Tags /////////////////////////////////////////////////////////////////////////////////////
    Tags.of(this).add("franchise", "VEX");

    // Import VPC by Name ///////////////////////////////////////////////////////////////////////////
    const vpc = ec2.Vpc.fromLookup(this, "vpc", {
      vpcName: `${context.environment}-vpc`,
    });

    // IAM Lambda role  //////////////////////////////////////////////////////////////////////////////
    // https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_iam.Role.html
    const lambdaRole = new iam.Role(this, 'lambda-role', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: `Lambda role for ${context.appName}`,
      roleName: `${context.appName}-lambda-role-${context.environment}`,
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('ReadOnlyAccess'),
        iam.ManagedPolicy.fromManagedPolicyArn(
          this, 
          'LambdaVPCAccessPolicy', 
          'arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole'
        )
    ]
    });

    // Attach inline policies to Lambda role  /////////////////////////////////////////////////////////
    lambdaRole.attachInlinePolicy(
      new iam.Policy(this, 'lambdaExecutionAccess', {
        policyName: 'lambdaExecutionAccess',
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            resources: ['*'],
            actions: [
              'logs:CreateLogGroup',
              'logs:CreateLogStream',
              'logs:DescribeLogGroups',
              'logs:DescribeLogStreams',
              'logs:PutLogEvents',
            ],
          }),
        ],
      })
    );

    // Import Private Subnets ///////////////////////////////////////////////////////////////////////
    const privateSubnets = context.privateSubnetIds.map((id, index) => ec2.Subnet.fromSubnetId(this, `privateSubnet${index}`, id));
    
    // Lambda Security Group  ///////////////////////////////////////////////////////////////////////
    const lambdaSG = new ec2.SecurityGroup(this, 'lambdaSG', {
      vpc,
      allowAllOutbound: true,
      securityGroupName: `${context.appName}-lambda-security-group-${context.environment}`,
    });
    lambdaSG.addIngressRule(ec2.Peer.ipv4(context.cidr), ec2.Port.allTcp(), 'Allow internal VPC traffic');

    // Lambda Layer ///////////////////////////////////////////////////////////////////////////////
    const lambdaLayer = new lambda.LayerVersion(this, 'lambdaLayer', {
      code: lambda.Code.fromAsset('lambda-layer'),
      compatibleRuntimes: [lambda.Runtime.NODEJS_14_X],
      description: `Lambda Layer for ${context.appName}`,
    });

    // Get Lambda definitions ////////////////////////////////////////////////////////////////////
    const lambdaDefinitions = getLambdaDefinitions(context); 

    // Loop through the definitions and create lambda functions
    for(const lambdaDefinition of lambdaDefinitions) {
        // Get functions props based on lambda definitions
        let functionProps = getFunctionProps(lambdaDefinition, lambdaRole, lambdaLayer, context);
        // Check if function is private and add VPC, SG and Subnets
        if (lambdaDefinition.isPrivate) {
          functionProps = {
            ...functionProps,
            vpc: vpc,
            securityGroups: [lambdaSG],
            vpcSubnets: {
              subnets: privateSubnets,
            },
          };
        }  


      // Create instance of NODEJS function ////////////////////////////////////////////////////////
      new NodejsFunction(this, `${lambdaDefinition.name}`, functionProps);

      // Create corresponding Log Group with one month retention  //////////////////////////////////
      new cwLogs.LogGroup(this, `fn-${lambdaDefinition.name}-log-group`, {
        logGroupName: `/aws/lambda/${context.appName}-${lambdaDefinition.name}-${context.environment}`,
        retention: cwLogs.RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      });
    }   
  }
}
