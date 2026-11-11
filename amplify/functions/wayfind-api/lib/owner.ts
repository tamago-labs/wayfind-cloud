import { ListTablesCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { dynamo } from "./clients.js";

/**
 * Owner backfill for Lambda-created rows: AppSync auto-fills `owner` only
 * for userPool calls, and the generated create inputs reject an explicit
 * `owner` — so without this, owner-scoped reads (Schedules tab, ledger
 * history) silently return []. Table names are discovered at runtime
 * (ListTables, cached): referencing data-stack tables from backend.ts would
 * create a CloudFormation circular dependency (data→function via
 * allow.resource, function→data via the table refs).
 * On failure the caller should delete the orphan row and 500.
 */
const ownerStampTables = new Map<string, string>();

export async function stampOwner(modelPrefix: string, id: string, owner: string): Promise<void> {
  let table = ownerStampTables.get(modelPrefix);
  if (!table) {
    let token: string | undefined;
    const found: string[] = [];
    do {
      const out = await dynamo.send(new ListTablesCommand({ ExclusiveStartTableName: token, Limit: 100 }));
      for (const name of out.TableNames ?? []) {
        if (name.startsWith(`${modelPrefix}-`) && name.endsWith("-NONE")) found.push(name);
      }
      token = out.LastEvaluatedTableName;
    } while (token);
    if (found.length === 0) throw new Error(`no ${modelPrefix} table found`);
    // One backend normally owns exactly one; prefer the most recently
    // created on the off chance several sandboxes share the account.
    table = found.sort().reverse()[0];
    if (found.length > 1) {
      console.warn(`[owner-stamp] ambiguous ${modelPrefix} tables, using ${table}`);
    }
    ownerStampTables.set(modelPrefix, table);
  }
  await dynamo.send(
    new UpdateItemCommand({
      TableName: table,
      Key: { id: { S: id } },
      UpdateExpression: "SET #o = :o",
      ExpressionAttributeNames: { "#o": "owner" },
      ExpressionAttributeValues: { ":o": { S: owner } },
    }),
  );
}
