import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2  from 'aws-cdk-lib/aws-ec2';
import { AutoScalingGroup } from 'aws-cdk-lib/aws-autoscaling';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';

export class HelloCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const labRole = iam.Role.fromRoleArn(this, 'Role', "arn:aws:iam::079553702230:role/LabRole", {mutable: false});

    // Create new Vpc
    const vpc = ec2.Vpc.fromLookup(this, 'VPC', {
      vpcId: 'vpc-052733467352389cf',
    });

    // Create a userdata script
    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      'yum update -y',
      'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash',
      'export NVM_DIR="$HOME/.nvm"',
      '[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"',
      '[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"',
      'nvm install node',
      'cd /home/ec2-user',
      'mkdir app',
      'cd app',
      'npm init -y',
      'npm install express',
      'echo "\nconst express = require(\'express\');\nconst app = express();\n\napp.get(\'/\', (req, res) => {\n  res.send(\'Hello World!\');\n});\n\napp.listen(80, () => {\n  console.log(\'Server is running on http://localhost:80\');\n});" >> index.js',
      'node index.js'
    );

    // Use the VPC to create an autoscaling group
    const asg = new AutoScalingGroup(this, 'ASG', {
      vpc,
      instanceType: new ec2.InstanceType('t2.micro'),
      machineImage: new ec2.AmazonLinuxImage({generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2023}),
      userData: userData,
      keyPair: ec2.KeyPair.fromKeyPairName(this, 'KeyPair', 'vockey'),
      vpcSubnets: {subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS},
      role: labRole,
    });

    // Create a load balancer
    const lb = new elbv2.ApplicationLoadBalancer(this, 'LB', {
      vpc,
      internetFacing: true,
    });

    // Add a listener and open up the load balancer's security group
    const listener = lb.addListener('Listener', {
      port: 80,
    });

    listener.addTargets('Target', {
      port: 80,
      targets: [asg],
    });

    // listener.connections.allowDefaultPortFromAnyIpv4('Open to the world');

    asg.scaleOnRequestCount('AModestLoad', {
      targetRequestsPerMinute: 60,
    });

    // Output the DNS where you can access your service
    new cdk.CfnOutput(this, 'LoadBalancerDNS', {
      value: lb.loadBalancerDnsName,
    });

    const topic = new sns.Topic(this, 'MyFirstTopic');

    // create a new s3 bucket and sns topic
    const bucket = new s3.Bucket(this, 'MyFirstBucket', {
      versioned: true,
      notificationsHandlerRole: labRole,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    bucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.SnsDestination(topic));

    // Output the bucket name and topic ARN
    new cdk.CfnOutput(this, 'BucketName', {
      value: bucket.bucketName,
    });

    new cdk.CfnOutput(this, 'TopicArn', {
      value: topic.topicArn,
    });

  }
}
