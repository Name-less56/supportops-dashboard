import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=name=>readFile(new URL(name,root),'utf8');

test('browser assets are local and use current versions',async()=>{
  const html=await read('index.html');
  const scripts=[...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(match=>match[1]);
  const styles=[...html.matchAll(/<link[^>]+href="([^"]+)"/g)].map(match=>match[1]);
  assert.deepEqual(scripts,['preferences.js?v=1','app.mjs?v=11']);
  assert.deepEqual(styles,['professional.css?v=8','navigation.css?v=6','theme-dark.css?v=1','theme.css?v=1']);
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

test('appearance preferences load first on every page and persist site-wide',async()=>{
  const {readdir}=await import('node:fs/promises');
  const pages=(await readdir(root)).filter(name=>name.endsWith('.html')&&name!=='suite.html');
  for(const page of pages){
    const html=await read(page);
    assert.match(html,/<body[^>]*><script src="preferences\.js\?v=\d+"><\/script>/,`${page} must load preferences.js before content`);
    assert.match(html,/theme-dark\.css/,`${page} must load the dark theme`);
    assert.match(html,/theme\.css/,`${page} must load the theme layer`);
  }
  const prefs=await read('preferences.js');
  assert.match(prefs,/localStorage/);
  assert.match(prefs,/addEventListener\('storage'/);
  assert.match(prefs,/prefers-color-scheme: dark/);
});

test('templates avoid inline style attributes blocked by the CSP',async()=>{
  for(const file of ['app.mjs','admin.mjs'])assert.doesNotMatch(await read(file),/ style="/,`${file} must use data-style instead of style=`);
  assert.doesNotMatch(await read('fullstack.css'),/body\{[^}]*transform:/,'a transform on body breaks the fixed navigation rail');
});
