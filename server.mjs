import express from 'express';
import helmet from 'helmet';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.dirname(fileURLToPath(import.meta.url));
const PORT=Number(process.env.PORT||4173);
const DATABASE_URL=process.env.DATABASE_URL||'postgres://supportops:supportops_dev_2026@localhost:55432/supportops';
const SESSION_COOKIE='supportops_session';
const pool=new pg.Pool({connectionString:DATABASE_URL,max:10});
const app=express();

app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'"],imgSrc:["'self'","data:"],connectSrc:["'self'"],fontSrc:["'self'"],objectSrc:["'none'"],baseUri:["'self'"],formAction:["'self'"]}}}));
app.use(express.json({limit:'100kb'}));
app.use((req,res,next)=>{if(!['GET','HEAD','OPTIONS'].includes(req.method)){const origin=req.get('origin');if(origin&&origin!==`${req.protocol}://${req.get('host')}`)return res.status(403).json({error:'Invalid request origin.'})}next()});

const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const randomToken=()=>crypto.randomBytes(32).toString('base64url');
const parseCookies=req=>Object.fromEntries((req.headers.cookie||'').split(';').filter(Boolean).map(part=>{const i=part.indexOf('=');return [decodeURIComponent(part.slice(0,i).trim()),decodeURIComponent(part.slice(i+1).trim())]}));
const safeUser=row=>({id:row.id,username:row.username,displayName:row.display_name,role:row.role,groupId:row.group_id,groupName:row.group_name,active:row.active});
const permissions={admin:['analytics:read','tickets:read','tickets:write','users:manage','taxonomy:manage'],supervisor:['analytics:read','tickets:read','tickets:write'],agent:['analytics:read','tickets:read','tickets:write']};

async function bootstrapDatabase(){
  await pool.query(await readFile(path.join(root,'schema.sql'),'utf8'));
  const count=Number((await pool.query('SELECT COUNT(*) count FROM users')).rows[0].count);
  if(count)return;
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const groupRows=(await client.query(`INSERT INTO support_groups(name,description,color) VALUES
      ('Customer Care','General customer enquiries and account support','#3974d8'),
      ('Billing & Risk','Payments, refunds and security reviews','#7a68d8'),
      ('Fulfilment','Orders, delivery and product availability','#3b9b8b') RETURNING *`)).rows;
    const categoryRows=(await client.query(`INSERT INTO categories(name,description,sla_hours) VALUES
      ('Billing','Charges, refunds and invoices',4),('Accounts','Access and account changes',8),
      ('Orders','Order status and fulfilment',12),('Security','Login and verification alerts',2),
      ('Subscriptions','Plans, renewals and cancellation',8),('General','General support requests',24) RETURNING *`)).rows;
    const credentials=[
      ['admin@supportops.demo','Seth Admin','AdminDemo!2026','admin',groupRows[0].id],
      ['lead@supportops.demo','Maya Lead','LeadDemo!2026','supervisor',groupRows[1].id],
      ['agent@supportops.demo','Leo Agent','AgentDemo!2026','agent',groupRows[2].id]
    ];
    const userRows=[];
    for(const [username,name,password,role,groupId] of credentials){
      const hash=await bcrypt.hash(password,11);
      userRows.push((await client.query('INSERT INTO users(username,display_name,password_hash,role,group_id) VALUES($1,$2,$3,$4,$5) RETURNING *',[username,name,hash,role,groupId])).rows[0]);
    }
    const subjects=['Refund request pending','Account access issue','Order confirmation missing','Duplicate charge inquiry','Subscription cancellation','Verification process question','Delivery timeline clarification','Payment method rejected','Invoice requested','Unexpected login alert','Product availability question','Password recovery assistance','Chargeback evidence requested','Address update failed','Renewal price question','Damaged delivery report','Two-factor authentication issue','Plan downgrade request'];
    const priorities=['Critical','High','Medium','Low'];const statuses=['Open','In progress','Resolved'];const channels=['Email','Chat','Web','Phone'];
    for(let i=0;i<72;i++){
      const category=categoryRows[i%categoryRows.length],group=groupRows[i%groupRows.length],status=statuses[Math.floor(i/3)%statuses.length],priority=priorities[(i*3)%priorities.length];
      const created=new Date(Date.now()-(i%45)*86400000-(i%10)*3600000);const resolved=status==='Resolved'?new Date(created.getTime()+(2+(i%18))*3600000):null;
      await client.query(`INSERT INTO tickets(public_id,subject,category_id,group_id,assigned_user_id,priority,status,channel,created_at,updated_at,resolved_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[`T-${2100+i}`,subjects[i%subjects.length],category.id,group.id,userRows[i%userRows.length].id,priority,status,channels[i%channels.length],created,resolved||created,resolved]);
    }
    await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}

async function waitForDatabase(){
  let lastError;
  for(let attempt=1;attempt<=20;attempt++){
    try{await pool.query('SELECT 1');return}
    catch(error){lastError=error;if(attempt<20)await new Promise(resolve=>setTimeout(resolve,750))}
  }
  throw lastError;
}

async function seedProfessionalModules(){
  const userRows=(await pool.query('SELECT id FROM users ORDER BY id')).rows;
  const ticketRows=(await pool.query('SELECT id,status,created_at FROM tickets ORDER BY id')).rows;
  if(!userRows.length||!ticketRows.length)return;
  let customers=(await pool.query('SELECT id FROM customers ORDER BY id')).rows;
  if(!customers.length){
    customers=(await pool.query(`INSERT INTO customers(display_name,organization,tier,health_score) VALUES
      ('Amelia Stone','Northstar Market','Enterprise',94),('Noah Martin','Tangent Labs','Growth',87),
      ('Sofia Rivera','Atlas Commerce','Enterprise',72),('Oliver Chen','Brightpath Studio','Standard',91),
      ('Emma Wilson','Pioneer Retail','Growth',64),('Liam Brooks','Vertex Supply','Standard',83) RETURNING id`)).rows;
  }
  for(let i=0;i<ticketRows.length;i++)await pool.query(`UPDATE tickets SET customer_id=COALESCE(customer_id,$1),description=CASE WHEN description='' THEN 'Synthetic customer request used to demonstrate a complete support workflow.' ELSE description END,first_responded_at=CASE WHEN status!='Open' AND first_responded_at IS NULL THEN created_at+INTERVAL '45 minutes' ELSE first_responded_at END,tags=CASE WHEN cardinality(tags)=0 THEN $2::text[] ELSE tags END WHERE id=$3`,[customers[i%customers.length].id,[i%3===0?'vip':'standard',i%4===0?'follow-up':'operations'],ticketRows[i].id]);
  if(Number((await pool.query('SELECT COUNT(*) count FROM automation_rules')).rows[0].count)===0)await pool.query(`INSERT INTO automation_rules(name,trigger_label,action_label) VALUES
    ('Critical ticket escalation','Priority becomes Critical','Notify supervisor and mark escalated'),
    ('SLA risk reminder','SLA has less than 60 minutes','Notify assigned agent'),
    ('Inactive ticket follow-up','No activity for 48 hours','Add reminder and internal note'),
    ('Billing routing','Category is Billing','Assign to Billing & Risk'),
    ('Resolution survey','Ticket is resolved','Queue CSAT survey')`);
  if(Number((await pool.query('SELECT COUNT(*) count FROM knowledge_articles')).rows[0].count)===0)await pool.query(`INSERT INTO knowledge_articles(title,category,excerpt,views,helpful_percent) VALUES
    ('How refund reviews work','Billing','A concise guide to refund stages, timelines, and evidence.',684,93),
    ('Recovering account access','Accounts','Secure steps for restoring access without exposing credentials.',531,96),
    ('Order status and delivery windows','Orders','Where to find shipment status and interpret delivery estimates.',447,89),
    ('Recognising suspicious login activity','Security','Recommended actions when a login does not look familiar.',389,97),
    ('Managing a subscription','Subscriptions','Upgrade, downgrade, renewal, and cancellation guidance.',312,91)`);
  if(Number((await pool.query('SELECT COUNT(*) count FROM notifications')).rows[0].count)===0){
    for(const user of userRows)await pool.query(`INSERT INTO notifications(user_id,title,body,kind) VALUES
      ($1,'SLA attention required','Several active tickets are approaching or beyond their SLA.','warning'),
      ($1,'Workspace ready','Professional operations modules are available for review.','success')`,[user.id]);
  }
  if(Number((await pool.query('SELECT COUNT(*) count FROM ticket_comments')).rows[0].count)===0){
    for(let i=0;i<Math.min(8,ticketRows.length);i++)await pool.query(`INSERT INTO ticket_comments(ticket_id,author_id,body,visibility) VALUES($1,$2,$3,$4)`,[ticketRows[i].id,userRows[i%userRows.length].id,i%2?'Customer context reviewed; next action has been confirmed.':'Internal review completed. No sensitive data is included in this demo.',i%2?'public':'internal']);
  }
  if(Number((await pool.query('SELECT COUNT(*) count FROM ticket_events')).rows[0].count)===0){
    for(let i=0;i<Math.min(12,ticketRows.length);i++)await pool.query(`INSERT INTO ticket_events(ticket_id,actor_id,event_type,detail) VALUES($1,$2,'seeded','Ticket imported into the professional demo workspace.')`,[ticketRows[i].id,userRows[i%userRows.length].id]);
  }
  await pool.query(`INSERT INTO app_settings(key,value) VALUES('governance',$1::jsonb) ON CONFLICT(key) DO NOTHING`,[JSON.stringify({timezone:'America/Bogota',businessStart:'08:00',businessEnd:'18:00',weekends:false,retentionDays:365,passwordMin:10,failedAttempts:5,mfaPolicy:'optional',backupFrequency:'daily',auditRetentionDays:730,defaultSlaHours:8})]);
}

async function auth(req,res,next){
  const token=parseCookies(req)[SESSION_COOKIE];if(!token)return res.status(401).json({error:'Authentication required.'});
  const {rows}=await pool.query(`SELECT u.*,g.name group_name,s.token_hash FROM sessions s JOIN users u ON u.id=s.user_id LEFT JOIN support_groups g ON g.id=u.group_id WHERE s.token_hash=$1 AND s.expires_at>NOW() AND u.active=TRUE`,[sha(token)]);
  if(!rows[0])return res.status(401).json({error:'Session expired.'});req.user=rows[0];req.sessionHash=sha(token);next();
}
const allow=(...roles)=>(req,res,next)=>roles.includes(req.user.role)?next():res.status(403).json({error:'You do not have permission for this action.'});

app.post('/api/auth/login',async(req,res)=>{
  const username=String(req.body.username||'').trim().toLowerCase(),password=String(req.body.password||'');
  const {rows}=await pool.query('SELECT u.*,g.name group_name FROM users u LEFT JOIN support_groups g ON g.id=u.group_id WHERE LOWER(u.username)=$1 AND u.active=TRUE',[username]);
  if(!rows[0]||!await bcrypt.compare(password,rows[0].password_hash))return res.status(401).json({error:'Invalid username or password.'});
  const token=randomToken();await pool.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '8 hours')",[sha(token),rows[0].id]);
  await pool.query("INSERT INTO security_events(user_id,event_type,detail) VALUES($1,'login','Successful demo sign-in')",[rows[0].id]);
  res.cookie(SESSION_COOKIE,token,{httpOnly:true,sameSite:'strict',secure:process.env.NODE_ENV==='production',maxAge:8*3600000,path:'/'}).json({user:safeUser(rows[0]),permissions:permissions[rows[0].role]});
});
app.get('/api/auth/me',auth,(req,res)=>res.json({user:safeUser(req.user),permissions:permissions[req.user.role]}));
app.post('/api/auth/logout',auth,async(req,res)=>{await pool.query('DELETE FROM sessions WHERE token_hash=$1',[req.sessionHash]);res.clearCookie(SESSION_COOKIE,{path:'/'}).json({ok:true})});
app.post('/api/auth/forgot',async(req,res)=>{
  const username=String(req.body.username||'').trim().toLowerCase();const {rows}=await pool.query('SELECT id FROM users WHERE LOWER(username)=$1 AND active=TRUE',[username]);
  if(!rows[0])return res.json({message:'If the account exists, a reset link is available in demo mode.'});
  const token=randomToken();await pool.query("INSERT INTO password_resets(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '20 minutes')",[sha(token),rows[0].id]);
  res.json({message:'Demo reset token generated.',resetToken:token,resetUrl:`/reset-password.html?token=${encodeURIComponent(token)}`,expiresInMinutes:20});
});
app.post('/api/auth/reset',async(req,res)=>{
  const token=String(req.body.token||''),password=String(req.body.password||'');if(password.length<10)return res.status(400).json({error:'Password must contain at least 10 characters.'});
  const {rows}=await pool.query('SELECT * FROM password_resets WHERE token_hash=$1 AND used_at IS NULL AND expires_at>NOW()',[sha(token)]);if(!rows[0])return res.status(400).json({error:'Reset token is invalid or expired.'});
  const hash=await bcrypt.hash(password,11),client=await pool.connect();try{await client.query('BEGIN');await client.query('UPDATE users SET password_hash=$1,updated_at=NOW() WHERE id=$2',[hash,rows[0].user_id]);await client.query('UPDATE password_resets SET used_at=NOW() WHERE token_hash=$1',[sha(token)]);await client.query('DELETE FROM sessions WHERE user_id=$1',[rows[0].user_id]);await client.query('COMMIT')}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}res.json({ok:true});
});

app.get('/api/meta',auth,async(req,res)=>{const [categories,groups]=await Promise.all([pool.query('SELECT * FROM categories WHERE active=TRUE ORDER BY name'),pool.query('SELECT * FROM support_groups WHERE active=TRUE ORDER BY name')]);res.json({categories:categories.rows,groups:groups.rows})});

function ticketFilters(req,start=1){const values=[],clauses=[];const add=(sql,value)=>{values.push(value);clauses.push(sql.replace('?',`$${start+values.length-1}`))};
  if(req.user.role==='agent')add('t.group_id=?',req.user.group_id);if(req.query.status)add('t.status=?',req.query.status);if(req.query.priority)add('t.priority=?',req.query.priority);if(req.query.category)add('t.category_id=?',Number(req.query.category));if(req.query.group)add('t.group_id=?',Number(req.query.group));if(req.query.from)add('t.created_at>=?',req.query.from);if(req.query.to)add("t.created_at<?::date + INTERVAL '1 day'",req.query.to);if(req.query.search){const term=`%${req.query.search}%`;values.push(term,term);clauses.push(`(t.public_id ILIKE $${start+values.length-2} OR t.subject ILIKE $${start+values.length-1})`)}return {values,where:clauses.length?'WHERE '+clauses.join(' AND '):''}}

app.get('/api/tickets',auth,async(req,res)=>{const {values,where}=ticketFilters(req);const sort={newest:'t.created_at DESC',oldest:'t.created_at ASC',priority:"CASE t.priority WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END,t.created_at ASC",status:"CASE t.status WHEN 'Open' THEN 1 WHEN 'In progress' THEN 2 ELSE 3 END,t.created_at ASC"}[req.query.sort]||"CASE WHEN t.status='Resolved' THEN 999999 ELSE EXTRACT(EPOCH FROM (t.created_at + (c.sla_hours||' hours')::interval - NOW())) END ASC";
  const {rows}=await pool.query(`SELECT t.*,c.name category,c.sla_hours,g.name group_name,u.display_name assigned_name FROM tickets t JOIN categories c ON c.id=t.category_id JOIN support_groups g ON g.id=t.group_id LEFT JOIN users u ON u.id=t.assigned_user_id ${where} ORDER BY ${sort} LIMIT 250`,values);res.json({tickets:rows})});
app.post('/api/tickets',auth,async(req,res)=>{const {subject,categoryId,groupId,priority,channel}=req.body;if(String(subject||'').trim().length<4)return res.status(400).json({error:'Subject must contain at least 4 characters.'});const group=req.user.role==='agent'?req.user.group_id:Number(groupId);const next=Number((await pool.query("SELECT COALESCE(MAX(SUBSTRING(public_id FROM '[0-9]+')::int),2100)+1 next FROM tickets")).rows[0].next);const {rows}=await pool.query(`INSERT INTO tickets(public_id,subject,category_id,group_id,assigned_user_id,priority,status,channel) VALUES($1,$2,$3,$4,$5,$6,'Open',$7) RETURNING *`,[`T-${next}`,String(subject).trim().slice(0,160),Number(categoryId),group,req.user.id,priority,channel]);res.status(201).json({ticket:rows[0]})});
app.patch('/api/tickets/:id',auth,async(req,res)=>{const id=Number(req.params.id);const allowed=['Open','In progress','Resolved'];if(!allowed.includes(req.body.status))return res.status(400).json({error:'Invalid status.'});const groupClause=req.user.role==='agent'?' AND group_id=$3':'';const values=req.user.role==='agent'?[req.body.status,id,req.user.group_id]:[req.body.status,id];const {rows}=await pool.query(`UPDATE tickets SET status=$1::varchar,updated_at=NOW(),resolved_at=CASE WHEN $1::varchar='Resolved' THEN NOW() ELSE NULL END WHERE id=$2${groupClause} RETURNING *`,values);if(!rows[0])return res.status(404).json({error:'Ticket not found.'});res.json({ticket:rows[0]})});

app.get('/api/analytics',auth,async(req,res)=>{const {values,where}=ticketFilters(req);const base=`FROM tickets t JOIN categories c ON c.id=t.category_id JOIN support_groups g ON g.id=t.group_id ${where}`;const queries=[
  pool.query(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE t.status!='Resolved')::int active,COUNT(*) FILTER(WHERE t.status='Resolved')::int resolved,COUNT(*) FILTER(WHERE t.status!='Resolved' AND t.created_at + (c.sla_hours||' hours')::interval<NOW())::int breached,COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (t.resolved_at-t.created_at))/3600)::numeric,1),0) avg_resolution_hours ${base}`,values),
  pool.query(`SELECT TO_CHAR(DATE_TRUNC('day',t.created_at),'YYYY-MM-DD') label,COUNT(*)::int value ${base} GROUP BY 1 ORDER BY 1`,values),
  pool.query(`SELECT c.name label,COUNT(*)::int value ${base} GROUP BY c.name ORDER BY value DESC`,values),
  pool.query(`SELECT g.name label,COUNT(*)::int value ${base} GROUP BY g.name ORDER BY value DESC`,values),
  pool.query(`SELECT t.channel label,COUNT(*)::int value ${base} GROUP BY t.channel ORDER BY value DESC`,values),
  pool.query(`SELECT t.priority label,COUNT(*)::int value ${base} GROUP BY t.priority ORDER BY value DESC`,values)
  ];const [summary,daily,categories,groups,channels,priorities]=await Promise.all(queries);const s=summary.rows[0];s.resolution_rate=s.total?Math.round(s.resolved/s.total*100):0;res.json({summary:s,daily:daily.rows,categories:categories.rows,groups:groups.rows,channels:channels.rows,priorities:priorities.rows})});

app.get('/api/suite/overview',auth,async(req,res)=>{
  const {values,where}=ticketFilters(req),andWhere=where?'AND':'WHERE';const ticketBase=`FROM tickets t JOIN categories c ON c.id=t.category_id JOIN support_groups g ON g.id=t.group_id ${where}`;
  const [summary,hourly,agents,backlog,customers,articles,automations,notifications,sessions,security]=await Promise.all([
    pool.query(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE t.status!='Resolved')::int active,COUNT(*) FILTER(WHERE t.escalated)::int escalated,COUNT(*) FILTER(WHERE t.reopen_count>0)::int reopened,COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (t.first_responded_at-t.created_at))/60)::numeric,0),0)::int first_response_minutes,COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (t.resolved_at-t.created_at))/3600)::numeric,1),0) resolution_hours ${ticketBase}`,values),
    pool.query(`SELECT EXTRACT(HOUR FROM t.created_at)::int AS "hour",COUNT(*)::int AS value ${ticketBase} GROUP BY 1 ORDER BY 1`,values),
    pool.query(`SELECT COALESCE(u.display_name,'Unassigned') label,COUNT(*)::int assigned,COUNT(*) FILTER(WHERE t.status='Resolved')::int resolved FROM tickets t JOIN categories c ON c.id=t.category_id JOIN support_groups g ON g.id=t.group_id LEFT JOIN users u ON u.id=t.assigned_user_id ${where} GROUP BY u.display_name ORDER BY assigned DESC`,values),
    pool.query(`SELECT CASE WHEN NOW()-t.created_at<INTERVAL '1 day' THEN '< 1 day' WHEN NOW()-t.created_at<INTERVAL '3 days' THEN '1–3 days' WHEN NOW()-t.created_at<INTERVAL '7 days' THEN '3–7 days' ELSE '7+ days' END label,COUNT(*)::int value ${ticketBase} ${andWhere} t.status!='Resolved' GROUP BY 1 ORDER BY value DESC`,values),
    pool.query('SELECT * FROM customers ORDER BY health_score ASC,display_name'),
    pool.query('SELECT * FROM knowledge_articles ORDER BY views DESC'),
    pool.query('SELECT * FROM automation_rules ORDER BY id'),
    pool.query('SELECT * FROM notifications WHERE user_id=$1 ORDER BY read_at NULLS FIRST,created_at DESC LIMIT 20',[req.user.id]),
    pool.query('SELECT COUNT(*)::int active FROM sessions WHERE user_id=$1 AND expires_at>NOW()',[req.user.id]),
    pool.query(`SELECT se.*,u.display_name FROM security_events se LEFT JOIN users u ON u.id=se.user_id ${req.user.role==='admin'?'':'WHERE se.user_id=$1'} ORDER BY se.created_at DESC LIMIT 12`,req.user.role==='admin'?[]:[req.user.id])
  ]);
  const s=summary.rows[0];s.reopen_rate=s.total?Math.round(s.reopened/s.total*100):0;s.forecast_next_week=Math.round(s.total/6*1.08);s.csat=94;s.self_service=38;
  res.json({summary:s,hourly:hourly.rows,agents:agents.rows,backlog:backlog.rows,customers:customers.rows,articles:articles.rows,automations:automations.rows,notifications:notifications.rows,activeSessions:sessions.rows[0].active,securityEvents:security.rows});
});

app.get('/api/tickets/:id/detail',auth,async(req,res)=>{
  const values=[Number(req.params.id)],scope=req.user.role==='agent'?' AND t.group_id=$2':'';if(scope)values.push(req.user.group_id);
  const {rows}=await pool.query(`SELECT t.*,c.name category,c.sla_hours,g.name group_name,u.display_name assigned_name,cu.display_name customer_name,cu.organization,cu.tier FROM tickets t JOIN categories c ON c.id=t.category_id JOIN support_groups g ON g.id=t.group_id LEFT JOIN users u ON u.id=t.assigned_user_id LEFT JOIN customers cu ON cu.id=t.customer_id WHERE t.id=$1${scope}`,values);
  if(!rows[0])return res.status(404).json({error:'Ticket not found.'});
  const [comments,events,users]=await Promise.all([pool.query('SELECT tc.*,u.display_name author_name FROM ticket_comments tc LEFT JOIN users u ON u.id=tc.author_id WHERE ticket_id=$1 ORDER BY tc.created_at',[rows[0].id]),pool.query('SELECT te.*,u.display_name actor_name FROM ticket_events te LEFT JOIN users u ON u.id=te.actor_id WHERE ticket_id=$1 ORDER BY te.created_at DESC',[rows[0].id]),pool.query('SELECT id,display_name,role,group_id FROM users WHERE active=TRUE ORDER BY display_name')]);
  res.json({ticket:rows[0],comments:comments.rows,events:events.rows,users:users.rows});
});

app.post('/api/tickets/:id/comments',auth,async(req,res)=>{
  const ticketId=Number(req.params.id),body=String(req.body.body||'').trim().slice(0,2000),visibility=req.body.visibility==='public'?'public':'internal';if(body.length<2)return res.status(400).json({error:'Comment is too short.'});
  const allowed=(await pool.query(`SELECT id FROM tickets WHERE id=$1${req.user.role==='agent'?' AND group_id=$2':''}`,req.user.role==='agent'?[ticketId,req.user.group_id]:[ticketId])).rows[0];if(!allowed)return res.status(404).json({error:'Ticket not found.'});
  const {rows}=await pool.query('INSERT INTO ticket_comments(ticket_id,author_id,body,visibility) VALUES($1,$2,$3,$4) RETURNING *',[ticketId,req.user.id,body,visibility]);await pool.query(`UPDATE tickets SET first_responded_at=COALESCE(first_responded_at,NOW()),updated_at=NOW() WHERE id=$1`,[ticketId]);await pool.query(`INSERT INTO ticket_events(ticket_id,actor_id,event_type,detail) VALUES($1,$2,'comment',$3)`,[ticketId,req.user.id,`${visibility} comment added`]);res.status(201).json({comment:rows[0]});
});

app.patch('/api/tickets/:id/manage',auth,async(req,res)=>{
  const id=Number(req.params.id),existing=(await pool.query(`SELECT * FROM tickets WHERE id=$1${req.user.role==='agent'?' AND group_id=$2':''}`,req.user.role==='agent'?[id,req.user.group_id]:[id])).rows[0];if(!existing)return res.status(404).json({error:'Ticket not found.'});
  const priority=['Critical','High','Medium','Low'].includes(req.body.priority)?req.body.priority:existing.priority,status=['Open','In progress','Resolved'].includes(req.body.status)?req.body.status:existing.status,groupId=req.user.role==='agent'?existing.group_id:Number(req.body.groupId||existing.group_id),assignee=req.user.role==='agent'?existing.assigned_user_id:(Number(req.body.assignedUserId||existing.assigned_user_id)||null),tags=Array.isArray(req.body.tags)?req.body.tags.map(tag=>String(tag).trim().slice(0,28)).filter(Boolean).slice(0,8):existing.tags;
  const {rows}=await pool.query(`UPDATE tickets SET priority=$1::varchar,status=$2::varchar,group_id=$3,assigned_user_id=$4,tags=$5,escalated=$6,sla_paused_at=CASE WHEN $7 THEN COALESCE(sla_paused_at,NOW()) ELSE NULL END,updated_at=NOW(),resolved_at=CASE WHEN $2::varchar='Resolved' THEN COALESCE(resolved_at,NOW()) ELSE NULL END,reopen_count=reopen_count+CASE WHEN status='Resolved' AND $2::varchar!='Resolved' THEN 1 ELSE 0 END WHERE id=$8 RETURNING *`,[priority,status,groupId,assignee,tags,Boolean(req.body.escalated),Boolean(req.body.paused),id]);
  await pool.query(`INSERT INTO ticket_events(ticket_id,actor_id,event_type,detail) VALUES($1,$2,'workflow',$3)`,[id,req.user.id,`Updated to ${status}; priority ${priority}`]);res.json({ticket:rows[0]});
});

app.post('/api/tickets/bulk',auth,async(req,res)=>{
  const ids=Array.isArray(req.body.ids)?req.body.ids.map(Number).filter(Boolean).slice(0,100):[],status=['Open','In progress','Resolved'].includes(req.body.status)?req.body.status:null;if(!ids.length||!status)return res.status(400).json({error:'Select tickets and a valid status.'});
  const {rowCount}=await pool.query(`UPDATE tickets SET status=$1::varchar,updated_at=NOW(),resolved_at=CASE WHEN $1::varchar='Resolved' THEN NOW() ELSE NULL END WHERE id=ANY($2::int[])${req.user.role==='agent'?' AND group_id=$3':''}`,req.user.role==='agent'?[status,ids,req.user.group_id]:[status,ids]);res.json({updated:rowCount});
});

app.post('/api/automations/:id/run',auth,allow('admin','supervisor'),async(req,res)=>{const {rows}=await pool.query('UPDATE automation_rules SET run_count=run_count+1 WHERE id=$1 RETURNING *',[Number(req.params.id)]);if(!rows[0])return res.status(404).json({error:'Automation not found.'});await pool.query(`INSERT INTO notifications(user_id,title,body,kind) VALUES($1,'Automation simulated',$2,'success')`,[req.user.id,`${rows[0].name} completed in demo mode.`]);res.json({rule:rows[0],message:'Simulation completed. No external action was sent.'})});
app.patch('/api/notifications/read',auth,async(req,res)=>{await pool.query('UPDATE notifications SET read_at=NOW() WHERE user_id=$1 AND read_at IS NULL',[req.user.id]);res.json({ok:true})});
app.post('/api/integrations/jira',auth,(req,res)=>res.json({demo:true,message:'This is only a demo, but a production Jira connection can be implemented securely with OAuth and webhooks.'}));

app.get('/api/admin/settings',auth,allow('admin'),async(req,res)=>{const {rows}=await pool.query("SELECT value,updated_at FROM app_settings WHERE key='governance'");res.json({settings:rows[0]?.value||{},updatedAt:rows[0]?.updated_at})});
app.patch('/api/admin/settings',auth,allow('admin'),async(req,res)=>{const current=(await pool.query("SELECT value FROM app_settings WHERE key='governance'")).rows[0]?.value||{},allowed=['timezone','businessStart','businessEnd','weekends','retentionDays','passwordMin','failedAttempts','mfaPolicy','backupFrequency','auditRetentionDays','defaultSlaHours'],next={...current};for(const key of allowed)if(Object.hasOwn(req.body,key))next[key]=req.body[key];const {rows}=await pool.query("INSERT INTO app_settings(key,value,updated_at) VALUES('governance',$1::jsonb,NOW()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW() RETURNING value",[JSON.stringify(next)]);await pool.query("INSERT INTO security_events(user_id,event_type,detail) VALUES($1,'settings_updated','Governance and security policy updated')",[req.user.id]);res.json({settings:rows[0].value})});

app.get('/api/admin/users',auth,allow('admin'),async(req,res)=>{const {rows}=await pool.query('SELECT u.id,u.username,u.display_name,u.role,u.group_id,u.active,u.created_at,g.name group_name FROM users u LEFT JOIN support_groups g ON g.id=u.group_id ORDER BY u.id');res.json({users:rows})});
app.post('/api/admin/users',auth,allow('admin'),async(req,res)=>{const {username,displayName,password,role,groupId}=req.body;if(!username||!displayName||String(password).length<10)return res.status(400).json({error:'Username, display name, and a 10-character password are required.'});const hash=await bcrypt.hash(password,11);try{const {rows}=await pool.query('INSERT INTO users(username,display_name,password_hash,role,group_id) VALUES(LOWER($1),$2,$3,$4,$5) RETURNING id,username,display_name,role,group_id,active',[username,displayName,hash,role,groupId||null]);res.status(201).json({user:rows[0]})}catch(error){if(error.code==='23505')return res.status(409).json({error:'Username already exists.'});throw error}});
app.patch('/api/admin/users/:id',auth,allow('admin'),async(req,res)=>{const id=Number(req.params.id);const {displayName,role,groupId,active,password}=req.body;const values=[displayName,role,groupId||null,Boolean(active),id];let sql='UPDATE users SET display_name=$1,role=$2,group_id=$3,active=$4,updated_at=NOW()';if(password){values.push(await bcrypt.hash(String(password),11));sql+=`,password_hash=$${values.length}`}sql+=` WHERE id=$5 RETURNING id,username,display_name,role,group_id,active`;const {rows}=await pool.query(sql,values);res.json({user:rows[0]})});
app.delete('/api/admin/users/:id',auth,allow('admin'),async(req,res)=>{const id=Number(req.params.id);if(id===req.user.id)return res.status(400).json({error:'You cannot delete your own account.'});await pool.query('DELETE FROM users WHERE id=$1',[id]);res.json({ok:true})});

for(const entity of ['categories','groups']){
  const table=entity==='categories'?'categories':'support_groups';
  app.get(`/api/admin/${entity}`,auth,allow('admin'),async(req,res)=>{const {rows}=await pool.query(`SELECT * FROM ${table} ORDER BY name`);res.json({[entity]:rows})});
  app.post(`/api/admin/${entity}`,auth,allow('admin'),async(req,res)=>{const {name,description,color,slaHours}=req.body;const sql=entity==='categories'?`INSERT INTO categories(name,description,sla_hours) VALUES($1,$2,$3) RETURNING *`:`INSERT INTO support_groups(name,description,color) VALUES($1,$2,$3) RETURNING *`;const values=entity==='categories'?[name,description||'',Number(slaHours||8)]:[name,description||'',color||'#3974d8'];try{const {rows}=await pool.query(sql,values);res.status(201).json({item:rows[0]})}catch(error){if(error.code==='23505')return res.status(409).json({error:'Name already exists.'});throw error}});
  app.patch(`/api/admin/${entity}/:id`,auth,allow('admin'),async(req,res)=>{const {name,description,color,slaHours,active}=req.body;const sql=entity==='categories'?`UPDATE categories SET name=$1,description=$2,sla_hours=$3,active=$4 WHERE id=$5 RETURNING *`:`UPDATE support_groups SET name=$1,description=$2,color=$3,active=$4 WHERE id=$5 RETURNING *`;const values=entity==='categories'?[name,description||'',Number(slaHours||8),Boolean(active),Number(req.params.id)]:[name,description||'',color||'#3974d8',Boolean(active),Number(req.params.id)];const {rows}=await pool.query(sql,values);res.json({item:rows[0]})});
  app.delete(`/api/admin/${entity}/:id`,auth,allow('admin'),async(req,res)=>{try{await pool.query(`DELETE FROM ${table} WHERE id=$1`,[Number(req.params.id)]);res.json({ok:true})}catch(error){if(error.code==='23503')return res.status(409).json({error:'This item is used by existing tickets or users. Disable it instead.'});throw error}});
}

app.get('/api/health',async(req,res)=>{const result=await pool.query('SELECT NOW() now');res.json({status:'ok',database:'postgresql',time:result.rows[0].now})});
app.get('/',(req,res)=>res.redirect('/login.html'));
app.get(['/admin','/admin.html'],async(req,res,next)=>{try{const token=parseCookies(req)[SESSION_COOKIE];if(!token)return res.redirect('/login.html');const {rows}=await pool.query(`SELECT u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>NOW() AND u.active=TRUE`,[sha(token)]);if(rows[0]?.role!=='admin')return res.redirect('/index.html?access=denied');res.set('Cache-Control','no-store').sendFile(path.join(root,'admin.html'))}catch(error){next(error)}});
app.use((req,res,next)=>{if(['/server.mjs','/schema.sql','/package.json','/package-lock.json','/.env','/.env.example','/docker-compose.yml'].includes(req.path))return res.status(404).end();next()});
app.use(express.static(root,{extensions:['html'],index:false,maxAge:process.env.NODE_ENV==='production'?'1h':0}));
app.use((error,req,res,next)=>{console.error(error);res.status(500).json({error:'Unexpected server error.'})});

await waitForDatabase();
await bootstrapDatabase();
await seedProfessionalModules();
app.listen(PORT,()=>console.log(`SupportOps running at http://localhost:${PORT}`));
