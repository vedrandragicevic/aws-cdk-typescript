# Test CDK TypeScript project

This is a blank project for CDK development with TypeScript. This project was made purely for testing purposes.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands
* `npx aws-cdk init app --language=typescript`  Initiate a new cdk app in typescript
* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `cdk deploy`      deploy this stack to your default AWS account/region
* `cdk diff`        compare deployed stack with current state
* `cdk synth`       emits the synthesized CloudFormation template

1. Install git branch -> npm i git-branch
                         npm i -D @types/git-branch
2. Update cdk.json with globals and environments
3. Add getContext function to app file
4. Add createStacks function to app file
5. If adding Lambda functions update tsconfig.json and type.d.ts