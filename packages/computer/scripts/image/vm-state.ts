import { LambdaMicrovmsClient, GetMicrovmCommand } from '@aws-sdk/client-lambda-microvms';

const mv = new LambdaMicrovmsClient({ region: process.env.AWS_REGION ?? 'ap-southeast-1' });
const id = process.argv[2];
if (!id) throw new Error('usage: vm-state.ts <microvmId>');
const r = await mv.send(new GetMicrovmCommand({ microvmIdentifier: id }));
console.log(JSON.stringify({ state: r.state, endpoint: r.endpoint }, null, 1));
