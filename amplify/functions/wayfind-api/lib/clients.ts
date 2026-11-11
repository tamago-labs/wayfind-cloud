import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";
import { env } from "$amplify/env/wayfind-api";
import type { Schema } from "../../../data/resource";
import { LambdaMicrovmsClient } from "@aws-sdk/client-lambda-microvms";
import { S3Client } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

export { env };

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env as any);
Amplify.configure(resourceConfig, libraryOptions);
export const dataClient = generateClient<Schema>();
export const microvms = new LambdaMicrovmsClient({ region: env.AWS_REGION ?? process.env.AWS_REGION });
export const s3sync = new S3Client({ region: env.AWS_REGION ?? process.env.AWS_REGION });
export const dynamo = new DynamoDBClient({ region: env.AWS_REGION ?? process.env.AWS_REGION });

export const syncBucket = env.COMPUTER_WORKSPACE_BUCKET ?? "";

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
