import { CloudFormation } from 'aws-sdk';
import { Outputs } from 'aws-sdk/clients/cloudformation';

const getStackOutputs = async (stackName: string, region: string): Promise<Outputs | undefined> => {
  const cloudFormation = new CloudFormation({ region });
  const stackOutputs = await cloudFormation.describeStacks({ StackName: stackName }).promise();
  return stackOutputs?.['Stacks']?.[0]['Outputs'];
};

const findOutputValueByKey = (outputs: Outputs, key: string): string => {
  return outputs.find((output: any) => output.OutputKey?.includes(key))?.OutputValue || '';
};

const findOutputsByKeys = (outputs: Outputs, keys: string[]): string[] => {
  return keys.map((key: string) => findOutputValueByKey(outputs, key));
};

export { getStackOutputs, findOutputValueByKey, findOutputsByKeys };
