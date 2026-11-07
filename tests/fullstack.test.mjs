import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=name=>readFile(new URL(name,root),'utf8');

test('PostgreSQL schema includes auth, administration, and ticket entities',async()=>{
  const schema=await read('schema.sql');
  for(const table of ['support_groups','categories','users','tickets','sessions','password_resets'])assert.match(schema,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.match(schema,/role IN \('admin','supervisor','agent'\)/);
});

test('server hashes credentials and protects role-scoped routes',async()=>{
  const server=await read('server.mjs');
  assert.match(server,/bcrypt\.hash/);
  assert.match(server,/httpOnly:true/);
  assert.match(server,/sameSite:'strict'/);
  assert.match(server,/allow\('admin'\)/);
  assert.match(server,/user\.role==='agent'/);
  assert.match(server,/DELETE FROM sessions WHERE user_id/);
  assert.match(server,/app\.get\(\['\/admin','\/admin\.html'\]/);
  assert.match(server,/waitForDatabase/);
  assert.match(server,/status=\$1::varchar/);
});

test('three seeded demo roles and credentials are present',async()=>{
  const server=await read('server.mjs');
  for(const value of ['admin@supportops.demo','AdminDemo!2026','lead@supportops.demo','LeadDemo!2026','agent@supportops.demo','AgentDemo!2026'])assert.ok(server.includes(value));
});

test('professional suite is backed by PostgreSQL modules and Jira stays a demo',async()=>{
  const [schema,server,html,client]=await Promise.all([read('schema.sql'),read('server.mjs'),read('suite.html'),read('suite.mjs')]);
  for(const table of ['customers','ticket_comments','ticket_events','automation_rules','knowledge_articles','notifications','security_events','app_settings'])assert.match(schema,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.match(server,/\/api\/suite\/overview/);
  assert.match(server,/\/api\/integrations\/jira/);
  assert.match(server,/\/api\/admin\/settings/);
  assert.match(html,/This is only a demo, but it can be done\./);
  assert.match(html,/ONLY AVAILABLE INTEGRATION/);
  assert.doesNotMatch(html,/Slack|Teams|WhatsApp|Salesforce|HubSpot/i);
  assert.match(client,/supportops-consent-v1/);
});
