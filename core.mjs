export const STATUSES = ['Open', 'In progress', 'Resolved'];
export const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];
export const CHANNELS = ['Email', 'Chat', 'Web'];

export function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[ch]));
}

export function seedTickets(now = Date.now()) {
  const rows = [
    ['T-1042','Refund request pending','Billing','Critical','Open','Chat',-310],
    ['T-1041','Account access issue','Accounts','High','In progress','Email',-190],
    ['T-1040','Order confirmation missing','Orders','Medium','Open','Web',-65],
    ['T-1039','Duplicate charge inquiry','Billing','High','Open','Chat',-130],
    ['T-1038','Subscription cancellation','Subscriptions','Low','Resolved','Email',-360],
    ['T-1037','Verification process question','Accounts','Medium','In progress','Web',-200],
    ['T-1036','Delivery timeline clarification','Orders','Low','Resolved','Chat',-480],
    ['T-1035','Payment method rejected','Billing','Critical','In progress','Email',-45],
    ['T-1034','Invoice requested','Billing','Low','Resolved','Web',-690],
    ['T-1033','Unexpected login alert','Security','High','Open','Email',-160],
    ['T-1032','Product availability question','Orders','Medium','Resolved','Chat',-980],
    ['T-1031','Password recovery assistance','Accounts','High','Resolved','Web',-760]
  ];
  return rows.map(([id,subject,category,priority,status,channel,mins])=>({id,subject,category,priority,status,channel,createdAt:new Date(now+mins*60000).toISOString()}));
}

export const SLA_MINUTES = {Critical: 60, High: 180, Medium: 480, Low: 1440};
export function minutesOpen(ticket, now = Date.now()) {
  return Math.max(0, Math.floor((now-new Date(ticket.createdAt).getTime())/60000));
}
export function slaState(ticket, now = Date.now()) {
  if (ticket.status === 'Resolved') return 'resolved';
  const elapsed = minutesOpen(ticket, now);
  const limit = SLA_MINUTES[ticket.priority] ?? SLA_MINUTES.Low;
  if (elapsed >= limit) return 'breached';
  if (elapsed >= limit * .75) return 'warning';
  return 'on-track';
}
export function slaDetails(ticket, now = Date.now()) {
  const elapsed = minutesOpen(ticket, now);
  const limit = SLA_MINUTES[ticket.priority] ?? SLA_MINUTES.Low;
  return {state:slaState(ticket, now),elapsed,limit,remaining:limit-elapsed};
}
export function metrics(tickets, now = Date.now()) {
  const open = tickets.filter(t=>t.status !== 'Resolved');
  const breached = open.filter(t=>slaState(t,now)==='breached');
  const atRisk = open.filter(t=>slaState(t,now)==='warning');
  const resolved = tickets.filter(t=>t.status === 'Resolved');
  const byPriority = Object.fromEntries(PRIORITIES.map(p=>[p,tickets.filter(t=>t.priority===p).length]));
  const byCategory = tickets.reduce((acc,t)=>(acc[t.category]=(acc[t.category]||0)+1,acc),{});
  return {total:tickets.length, active:open.length, resolved:resolved.length, breached:breached.length,atRisk:atRisk.length,
    resolutionRate:tickets.length ? Math.round(resolved.length/tickets.length*100):0,byPriority,byCategory};
}
export function filterTickets(tickets, {q='',status='All',priority='All'}={}) {
  const term=q.trim().toLowerCase();
  return tickets.filter(t=>(status==='All'||t.status===status) && (priority==='All'||t.priority===priority) &&
    (!term || [t.id,t.subject,t.category,t.channel].some(s=>String(s).toLowerCase().includes(term))));
}
export function sortTickets(tickets, mode='sla', now=Date.now()) {
  const priorityRank=Object.fromEntries(PRIORITIES.map((p,index)=>[p,index]));
  return [...tickets].sort((a,b)=>{
    if(mode==='newest') return new Date(b.createdAt)-new Date(a.createdAt);
    if(mode==='priority') return priorityRank[a.priority]-priorityRank[b.priority] || new Date(a.createdAt)-new Date(b.createdAt);
    if(mode==='status') return STATUSES.indexOf(a.status)-STATUSES.indexOf(b.status) || new Date(a.createdAt)-new Date(b.createdAt);
    const score=t=>t.status==='Resolved'?Number.POSITIVE_INFINITY:slaDetails(t,now).remaining;
    return score(a)-score(b);
  });
}
export function createTicket(fields, tickets = [], now = Date.now()) {
  const subject = String(fields.subject||'').trim();
  if (subject.length < 4 || subject.length>160) throw new Error('Subject must be 4–160 characters.');
  if (!PRIORITIES.includes(fields.priority)) throw new Error('Invalid priority.');
  const category = String(fields.category||'General').trim().slice(0,60) || 'General';
  const next = Math.max(1000,...tickets.map(t=>Number(t.id.replace(/\D/g,''))||0))+1;
  return {id:`T-${next}`,subject,category,priority:fields.priority,status:'Open',channel:CHANNELS.includes(fields.channel)?fields.channel:'Web',createdAt:new Date(now).toISOString()};
}
export function changeStatus(tickets,id) {
  return tickets.map(t=>t.id===id?{...t,status:t.status==='Open'?'In progress':'Resolved'}:t);
}
export function toCSV(tickets) {
  const cols=['id','subject','category','priority','status','channel','createdAt'];
  const encode = v=>{
    let value=String(v??'');
    if (/^[\s\u0000-\u001f]*[=+\-@]/.test(value)) value=`'${value}`;
    return '"'+value.replace(/"/g,'""')+'"';
  };
  return [cols.join(','),...tickets.map(t=>cols.map(k=>encode(t[k])).join(','))].join('\r\n');
}
export function isTicketList(value) {
  return Array.isArray(value) && value.every(t=>t && typeof t.id==='string' && typeof t.subject==='string' &&
    STATUSES.includes(t.status) && PRIORITIES.includes(t.priority) && !Number.isNaN(Date.parse(t.createdAt)));
}
