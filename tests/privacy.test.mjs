import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=name=>readFile(new URL(name,root),'utf8');

test('browser assets are local and use current versions',async()=>{
  const html=await read('index.html');
  const scripts=[...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(match=>match[1]);
  const styles=[...html.matchAll(/<link[^>]+href="([^"]+)"/g)].map(match=>match[1]);
  assert.deepEqual(scripts,['app.mjs?v=11']);
  assert.deepEqual(styles,['professional.css?v=6','navigation.css?v=4']);
  assert.ok([...scripts,...styles].every(url=>!/^https?:/i.test(url)));
});

test('legal pages describe the actual PostgreSQL and session architecture',async()=>{
  const [html,privacy,terms,cookies]=await Promise.all([read('index.html'),read('privacy.html'),read('terms.html'),read('cookies.html')]);
  assert.match(html,/id="necessary-only" class="cookie-choice"/);
  assert.match(html,/id="allow-preferences" class="cookie-choice"/);
  assert.match(html,/id="cookie-settings"/);
  assert.match(privacy,/PostgreSQL/);
  assert.match(privacy,/HttpOnly/);
  assert.match(terms,/Demo accounts/);
  assert.match(cookies,/supportops_session/);
  assert.doesNotMatch(cookies,/does not currently set HTTP cookies/i);
});

test('ticket form consent is explicit and not preselected',async()=>{
  const html=await read('index.html');
  const checkbox=html.match(/<input type="checkbox" required>/)?.[0]||'';
  assert.match(checkbox,/required/);
  assert.doesNotMatch(checkbox,/checked/);
});

test('login has functional credentials, recovery, scopes, and authorship',async()=>{
  const [login,dashboard]=await Promise.all([read('login.html'),read('index.html')]);
  assert.match(login,/name="username" type="email"/);
  assert.match(login,/name="password" type="password"/);
  assert.match(login,/forgot-password\.html/);
  for(const username of ['admin@supportops.demo','lead@supportops.demo','agent@supportops.demo'])assert.ok(login.includes(username));
  assert.match(login,/Full access · Users · Categories · Groups/);
  assert.match(login,/All tickets · Analytics · Workflow/);
  assert.match(login,/Assigned group · Ticket updates/);
  assert.match(login,/Developed by: <strong>Seth Castañeda<\/strong>/);
  assert.match(dashboard,/Developed by: Seth Castañeda/);
  assert.ok(login.indexOf('login-developer')<login.indexOf('login-story-copy'));
});

test('role-restricted dashboard controls and navigation remain accessible',async()=>{
  const [html,admin,css]=await Promise.all([read('index.html'),read('admin.html'),read('navigation.css')]);
  assert.match(html,/id="admin-link" href="admin\.html"[^>]* hidden/);
  assert.doesNotMatch(html,/LIVE DATA INFRASTRUCTURE/);
  assert.match(admin,/LIVE DATA INFRASTRUCTURE/);
  assert.match(admin,/id="admin-sync"/);
  assert.doesNotMatch(admin,/Open admin panel/);
  assert.match(html,/data-nav-section="tickets"/);
  assert.match(html,/data-nav-section="analytics"/);
  assert.ok(html.indexOf('data-nav-section="analytics"')<html.indexOf('data-nav-section="tickets"'));
  assert.match(css,/\[hidden\]\{display:none!important\}/);
  assert.match(css,/sidebar-expanded/);
  assert.match(css,/@view-transition/);
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.match(css,/transform:none!important/);
});

test('professional suite uses the shared rail and floating notifications',async()=>{
  const [html,client,css]=await Promise.all([read('suite.html'),read('suite.mjs'),read('navigation.css')]);
  assert.match(html,/id="suite-shell"/);
  assert.match(html,/id="suite-rail"[^>]*aria-expanded="false"/);
  assert.match(html,/id="notification-scrim"/);
  assert.match(html,/id="notification-drawer" role="dialog" aria-modal="true"/);
  assert.match(client,/bindSuiteRail/);
  assert.match(client,/setNotificationDrawer/);
  assert.match(css,/\.suite-shell\.suite-rail-expanded/);
  assert.match(css,/\.notification-scrim\.open/);
  assert.match(css,/body\.notification-open\{overflow:hidden\}/);
});

test('admin workspace exposes user, category, and group management',async()=>{
  const admin=await read('admin.html');
  assert.match(admin,/id="user-form"/);
  assert.match(admin,/id="category-form"/);
  assert.match(admin,/id="group-form"/);
  assert.match(admin,/id="governance-form"/);
});
