import { Stack, StackProps, Tags } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import { aws_ec2 as ec2 } from "aws-cdk-lib";
import { aws_iam as iam } from "aws-cdk-lib";
import { aws_secretsmanager as secretsmanager } from "aws-cdk-lib";
import { CDKContext } from "../types";
import * as cloudwatch_logs from "aws-cdk-lib/aws-logs";
import * as path from "path";
import { aws_lambda as lambda } from "aws-cdk-lib";
import * as cr from "aws-cdk-lib/custom-resources";



export class CvhamTsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: cdk.StackProps, context: CDKContext) {
    super(scope, id, props);

    // Add Tags Where Applicable
    Tags.of(this).add("franchise", "VEX");

    // Import VPC by Name
    const vpc = ec2.Vpc.fromLookup(this, "vpc", {
      vpcName: `${context.environment}-vpc`,
    });

    // Import Raw Bucket
    const raw_bucket = s3.Bucket.fromBucketName(
      this,
      "raw-bucket",
      `${context.environment}-RAW-${context.raw_name}`
    );

    // Import Curated Bucket
    const curated_bucket = s3.Bucket.fromBucketName(
      this,
      "curated-bucket",
      `${context.environment}-CURATED-${context.analytics_name}`
    );

    // Storage Gateway Bucket Prefix
    const storage_gateway_s3_prefix = `platform/us-east-1/${context.accountNumber}/${context.environment}/ls/hr/sg/`;
    
    // Import Landing Bucket for NFS
    const landing_bucket = s3.Bucket.fromBucketName(
      this,
      "sg-landing",
      `${context.environment}-LANDING-TEST`
    )

    // Storage Gateway IAM Role
    const storage_gateway_role = new iam.Role(
      this,
      "storage-gateway-s3-iam-role",
      {
        roleName: `${context.environment}-${context.appName}-landing`,
        assumedBy: new iam.ServicePrincipal("storagegateway.amazonaws.com"),
        description:
          "Role assumed by storage gateway to automate transfer to S3 landing zone",
      }
    );

    // IAM Policy
    const replication_transfer_policy = new iam.Policy(
      this,
      "replication-s3-transfer-policy",
      {
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
              "s3:ListBucket",
              "s3:GetReplicationConfiguration",
              "s3:GetObjectVersionForReplication",
              "s3:GetObjectVersionAcl",
              "s3:GetObjectVersionTagging",
              "s3:GetObjectRetention",
              "s3:GetObjectLegalHold",
            ],
            resources: [
              landing_bucket.bucketArn,
              landing_bucket.bucketArn + "/*",
              raw_bucket.bucketArn,
              raw_bucket.bucketArn + "/*",
              curated_bucket.bucketArn,
              curated_bucket.bucketArn + "/*",
            ],
          }),
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
              "s3:ReplicateObject",
              "s3:ReplicateDelete",
              "s3:ReplicateTags",
              "s3:ObjectOwnerOverrideToBucketOwner",
              "s3:GetObjectVersionTagging",
            ],
            resources: [
              raw_bucket.bucketArn + "/*",
              curated_bucket.bucketArn + "/*",
            ],
          }),
        ],
      }
    );

    // Attach the Policy to the role
    storage_gateway_role.attachInlinePolicy(replication_transfer_policy);


    /*=====================================================================================*/
    /*================================STORAGE GATEWAY====================================== */
    /*=====================================================================================*/

    // Lambda IAM Role
    const customStorageGatewayRole = new iam.Role(this, "customResourceRole", {
      assumedBy: new iam.CompositePrincipal(
        new iam.AccountPrincipal(`${context.accountNumber}`),
        new iam.ServicePrincipal("lambda.amazonaws.com")
      ),
    });

    // IAM Policies
    customStorageGatewayRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        resources: ["*"],
        actions: [
          "storagegateway:*",
          "logs:*",
          "secretsmanager:GetSecretValue",
          "iam:PassRole",
        ],
      })
    );
    customStorageGatewayRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.DENY,
        resources: ["*"],
        actions: ["logs:Delete*"],
      }) 
    );

    // Lambda Definition That Will Create a Storage Gateway
    const custom_Storage_Gateway_Agent_Lambda = new lambda.Function(
      this,
      "custom-agent-lambda",
      {
        functionName: `${context.environment}-${context.appName}-ch-sg-modify`,
        code: lambda.Code.fromAsset("../storagegateway"),
        handler: "lambda.on_event",
        runtime: lambda.Runtime.PYTHON_3_9,
        timeout: cdk.Duration.seconds(600),
        reservedConcurrentExecutions: 1,
        role: customStorageGatewayRole
      }
    );

    // Define an AWS CloudFormation custom resource provider
    const customStorageGatewayAgentProvider = new cr.Provider(
      this,
      "agentProvider",
      {
        onEventHandler: custom_Storage_Gateway_Agent_Lambda,
      }
    );

    // Create New Cloudwatch Group
    const storage_gateway_log_group = new cloudwatch_logs.LogGroup(
      this,
      `${context.environment}-Storage-Gateway-Log-Group`
    );

    // 
    const storageGatewayAgent = new cdk.CustomResource(
      this,
      "sgCustomResource-1",
      {
        serviceToken: customStorageGatewayAgentProvider.serviceToken,
        properties: {
          ActivationKey: `${context.agentActivationKey}`,
          GatewayName: `${context.environment}-CVH-Storage-Gateway`,
          GatewayTimezone: "GMT-2:00",
          GatewayRegion: "us-east-1",
          GatewayType: "FILE_S3",
          SecretId: `${context.storage_gateway_instrument_credentials}`,
          LogARN: storage_gateway_log_group.logGroupArn,
        },
      }
    );

    /*=====================================================================================*/
    /*===========================STORAGE GATEWAY FILE SHARE================================ */
    /*=====================================================================================*/

    // FIle Share IAM Role
    const fileShareRole = new iam.Role(this, "fileShareRole", {
      assumedBy: new iam.CompositePrincipal(
        new iam.AccountPrincipal(`${context.accountNumber}`),
        new iam.ServicePrincipal("storagegateway.amazonaws.com")
      ),
    });

    fileShareRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        resources: ["*"],
        actions: [
          "logs:PutLogEvents",
          "logs:CreateLogStream",
        ],
      })
    );
    fileShareRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        resources: [
          landing_bucket.bucketArn,
          landing_bucket.bucketArn + '/*'
        ],
        actions: [
          "s3:List*",
          "s3:Put*",
          "s3:Get*",
          "s3:HeadObject"],
      })
    );

    // Custom Resource Lambda That Will Create A File Share
    const custom_Storage_Gateway_Share_Lambda = new lambda.Function(
      this,
      "custom-resource-lambda",
      {
        functionName: `${context.environment}-${context.appName}-cvh-share-modify`,
        code: lambda.Code.fromAsset(path.join(__dirname, "../share/")),
        handler: "lambda.on_event",
        runtime: lambda.Runtime.PYTHON_3_9,
        timeout: cdk.Duration.seconds(600),
        reservedConcurrentExecutions: 5,
        role: customStorageGatewayRole,
      }
    );

    // Define an AWS CloudFormation custom resource provider
    const customStorageGatewayShareProvider = new cr.Provider(
      this,
      "shareProvider",
      {
        onEventHandler: custom_Storage_Gateway_Share_Lambda,
      }
    );

    // CellaVista Hamilton File Share Log Group
    const cvhamLogGroup = new cloudwatch_logs.LogGroup(
      this,
      "CVH-Log-Group"
    );

    // 
    const sg_02_share = new cdk.CustomResource(this, "sg-cvh-CustomShare", {
      serviceToken: customStorageGatewayShareProvider.serviceToken,
      properties: {
        ShareType: "NFS", //Valid options are "SMB" or "NFS"
        GatewayARN: storageGatewayAgent.ref,
        Role: fileShareRole.roleArn,
        LocationARN:
          landing_bucket.bucketArn +
          "/" +
          storage_gateway_s3_prefix +
          "cellavista-hamilton/",
        ClientList: "10.14.0.0/16", // Only relevant for NFS shares
        FileShareName: "CVH-Data",
        SecretId: `${context.storage_gateway_instrument_credentials}`,
        ClientToken: "sg-ch-CustomShareToken",
        AuditDestinationARN: cvhamLogGroup.logGroupArn,
      },
    });



  }
}
