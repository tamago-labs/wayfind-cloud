import { LambdaMicrovmsClient, TerminateMicrovmCommand } from '@aws-sdk/client-lambda-microvms';
import { mv } from './config';

const id = process.argv[2];
if (!id) throw new Error('usage: vm-terminate.ts <microvmId>');
await mv.send(new TerminateMicrovmCommand({ microvmIdentifier: id }));
console.log(`Terminated ${id}`);
