const $=id=>document.getElementById(id);
const state={user:null,permissions:[],meta:{categories:[],groups:[]},overview:null,tickets:[],selected:new Set(),activeView:'command',board:'kanban',customerFilter:null,tourIndex:0,shortcutPrefix:null,commandResults:[],commandIndex:0};
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const api=async(url,options={})=>{const response=await fetch(url,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}}),data=await response.json().catch(()=>({}));if(response.status===401){location.assign('/login.html');throw new Error('Session expired.')}if(!response.ok)throw new Error(data.error||'Request failed.');return data};
const announce=(message,type='success')=>{const el=$('notice');el.textContent=message;el.dataset.type=type;clearTimeout(announce.timer);announce.timer=setTimeout(()=>el.textContent='',3400)};
const dateTime=value=>new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value));
const can=(...roles)=>roles.includes(state.user?.role);
const initials=name=>String(name||'?').split(/\s+/).filter(Boolean).map(word=>word[0]).join('').slice(0,2).toUpperCase();
const nextStatus={Open:['In progress','Start'],'In progress':['Resolved','Resolve'],Resolved:['Open','Reopen']};
const greeting=()=>{const hour=new Date().getHours(),name=(state.user?.displayName||'').split(' ')[0];return `${hour<12?'Good morning':hour<18?'Good afternoon':'Good evening'}${name?`, ${name}`:''}`};
const prefs=window.SupportOpsPreferences;
const viewCopy={command:['COMMAND CENTER','Good afternoon','Your support operation at a glance.'],kanban:['TICKET OPERATIONS','Ticket board','Organise, assign and advance work across every queue.'],customers:['CUSTOMER 360','Customer relationships','Understand context before taking action.'],knowledge:['SELF-SERVICE','Knowledge base','Consistent answers that improve with every interaction.'],automation:['WORKFLOW ENGINE','Automation','Remove repetitive work while keeping people in control.'],reports:['EXECUTIVE ANALYTICS','Reports and forecasts','Turn operational activity into clear decisions.'],security:['TRUST CENTER','Security and access','Protect accounts, sessions and operational data.'],integration:['INTEGRATIONS','Jira connection','Bridge support and engineering work.'],preferences:['PERSONAL WORKSPACE','Preferences','Adapt the interface to the way you work.']};

function showView(name){state.activeView=name;if($('notification-drawer').classList.contains('open'))setNotificationDrawer(false,false);document.querySelectorAll('.suite-view,.suite-nav').forEach(node=>node.classList.remove('active'));$(`view-${name}`).classList.add('active');document.querySelector(`.suite-nav[data-view="${name}"]`).classList.add('active');const [kicker,title,subtitle]=viewCopy[name];$('view-kicker').textContent=kicker;$('view-title').textContent=name==='command'?greeting():title;$('view-subtitle').textContent=subtitle;history.replaceState(null,'',`#${name}`);window.scrollTo({top:0,behavior:prefs.get().reduceMotion?'auto':'smooth'})}

function bindSuiteRail(){const shell=$('suite-shell'),rail=$('suite-rail'),desktop=matchMedia('(min-width:921px)');let collapseTimer,keyboardMode=false;const expand=()=>{if(!desktop.matches)return;clearTimeout(collapseTimer);shell.classList.add('suite-rail-expanded');rail.setAttribute('aria-expanded','true')};const collapse=()=>{if(!desktop.matches)return;collapseTimer=setTimeout(()=>{const keyboardFocus=keyboardMode&&rail.contains(document.activeElement);if(!rail.matches(':hover')&&!keyboardFocus){shell.classList.remove('suite-rail-expanded');rail.setAttribute('aria-expanded','false')}},60)};const syncViewport=()=>{clearTimeout(collapseTimer);shell.classList.remove('suite-rail-expanded');rail.setAttribute('aria-expanded',String(!desktop.matches))};addEventListener('keydown',event=>{if(event.key==='Tab')keyboardMode=true},true);addEventListener('pointerdown',()=>keyboardMode=false,true);rail.addEventListener('pointerenter',expand);rail.addEventListener('pointerleave',collapse);rail.addEventListener('focusin',expand);rail.addEventListener('focusout',collapse);desktop.addEventListener('change',syncViewport);syncViewport()}
function setNotificationDrawer(open,restoreFocus=true){const drawer=$('notification-drawer'),scrim=$('notification-scrim');drawer.classList.toggle('open',open);scrim.classList.toggle('open',open);drawer.setAttribute('aria-hidden',String(!open));$('suite-shell').inert=open;document.body.classList.toggle('notification-open',open);if(open)requestAnimationFrame(()=>$('notification-close').focus());else if(restoreFocus)$('notification-open').focus()}

function renderMetrics(){
  const s=state.overview.summary,cards=[['Active queue',s.active,'Open work requiring attention','▤','kanban'],['First response',`${s.first_response_minutes}m`,'Average response time','◷','reports'],['Escalated',s.escalated,'High-touch cases','↑','kanban:escalated'],['CSAT',`${s.csat}%`,'Simulated satisfaction','♡','reports'],['7-day forecast',s.forecast_next_week,'Expected new tickets','⌁','reports']];
  $('suite-metrics').innerHTML=cards.map(([label,value,note,icon,target],index)=>`<button type="button" class="suite-metric reveal" data-style="--delay:${index*45}ms" data-metric-target="${target}"><span>${esc(label)}<i>${icon}</i></span><strong>${esc(value)}</strong><small>${esc(note)}</small></button>`).join('');
  document.querySelectorAll('[data-metric-target]').forEach(card=>card.onclick=()=>{const [view,filter]=card.dataset.metricTarget.split(':');if(view==='kanban')setTicketFilter(filter||'all');showView(view)});
  const health=Math.max(70,Math.min(99,100-Math.round(s.escalated/Math.max(1,s.total)*100))),orb=document.querySelector('.health-orb>div');
  $('health-score').textContent=health;orb.style.setProperty('--score',`${health}%`);orb.setAttribute('role','img');orb.setAttribute('aria-label',`Service health ${health} out of 100`);
}
function renderCapacity(){$('agent-capacity').innerHTML=state.overview.agents.map(row=>{const rate=Math.round(row.resolved/Math.max(1,row.assigned)*100);return `<div><span><strong>${esc(row.label)}</strong><small>${row.assigned} assigned · ${row.resolved} resolved</small></span><div><i data-style="width:${rate}%"></i></div><b>${rate}%</b></div>`}).join('')}
function renderBacklog(){const max=Math.max(1,...state.overview.backlog.map(row=>row.value));$('backlog-chart').innerHTML=state.overview.backlog.map(row=>`<div><span>${esc(row.label)}</span><i><b data-style="width:${Math.round(row.value/max*100)}%"></b></i><strong>${row.value}</strong></div>`).join('')}

function ticketCard(ticket){
  const [target,label]=nextStatus[ticket.status]||[];
  return `<article class="kanban-card${ticket.escalated?' escalated':''}" draggable="true" data-ticket="${ticket.id}"><label class="select-ticket"><input type="checkbox" data-select-ticket="${ticket.id}" ${state.selected.has(ticket.id)?'checked':''}><span class="sr-only">Select ${esc(ticket.public_id)}</span></label><button class="ticket-open" data-open-ticket="${ticket.id}"><span><b>${esc(ticket.public_id)}</b><em class="priority-label ${ticket.priority}"><i class="priority-dot ${ticket.priority}"></i>${ticket.priority}</em>${ticket.escalated?'<em class="escalated-flag">Escalated</em>':''}</span><strong>${esc(ticket.subject)}</strong><small>${esc(ticket.category)} · ${esc(ticket.group_name)}</small><footer><span>${esc(ticket.assigned_name||'Unassigned')}</span><em>${ticket.tags?.slice(0,2).map(tag=>`#${esc(tag)}`).join(' ')||'No tags'}</em></footer></button>${target?`<button class="card-advance" type="button" data-advance-ticket="${ticket.id}" data-target="${target}">${label} →</button>`:''}</article>`;
}
function setTicketFilter(value){$('ticket-filter').value=value;renderKanban()}
function filtersActive(){return Boolean(state.customerFilter||$('ticket-search').value.trim()||$('ticket-filter').value!=='all')}
function visibleTickets(){
  const query=$('ticket-search').value.trim().toLowerCase(),filter=$('ticket-filter').value;
  return state.tickets.filter(ticket=>{
    if(state.customerFilter&&ticket.customer_id!==state.customerFilter.id)return false;
    if(filter==='mine'&&ticket.assigned_user_id!==state.user.id)return false;
    if(filter==='unassigned'&&ticket.assigned_user_id)return false;
    if(filter==='escalated'&&!ticket.escalated)return false;
    if(filter==='urgent'&&!['Critical','High'].includes(ticket.priority))return false;
    return !query||`${ticket.public_id} ${ticket.subject} ${ticket.category} ${ticket.group_name} ${ticket.assigned_name||''} ${(ticket.tags||[]).join(' ')}`.toLowerCase().includes(query);
  });
}
function renderKanban(){
  const statuses=['Open','In progress','Resolved'],tickets=visibleTickets(),empty=filtersActive()?'No tickets match these filters':'No tickets in this stage';
  $('ticket-scope-note').hidden=!state.customerFilter;$('ticket-scope-note').textContent=state.customerFilter?`${state.customerFilter.display_name} · Clear filter ×`:'';
  $('kanban-board').innerHTML=statuses.map(status=>{const rows=tickets.filter(ticket=>ticket.status===status);return `<section class="kanban-column" data-drop-status="${status}"><header><span class="status ${status}">${status}</span><b>${rows.length}</b></header><div>${rows.map(ticketCard).join('')||`<p class="column-empty">${empty}</p>`}</div></section>`}).join('');
  bindTicketCards();renderAlternateBoards();
}
function bindTicketCards(){
  document.querySelectorAll('[data-open-ticket]').forEach(button=>button.onclick=()=>openTicket(Number(button.dataset.openTicket)));
  document.querySelectorAll('[data-advance-ticket]').forEach(button=>button.onclick=async()=>{button.disabled=true;await manageTicket(Number(button.dataset.advanceTicket),{status:button.dataset.target})});
  document.querySelectorAll('[data-select-ticket]').forEach(input=>input.onchange=()=>{const id=Number(input.dataset.selectTicket);input.checked?state.selected.add(id):state.selected.delete(id);updateSelectedCount()});
  document.querySelectorAll('.kanban-card').forEach(card=>card.ondragstart=event=>{event.dataTransfer.setData('text/plain',card.dataset.ticket);event.dataTransfer.effectAllowed='move'});
  document.querySelectorAll('[data-drop-status]').forEach(column=>{
    column.ondragover=event=>{event.preventDefault();column.classList.add('drag-over')};
    column.ondragleave=()=>column.classList.remove('drag-over');
    column.ondrop=async event=>{event.preventDefault();column.classList.remove('drag-over');const id=Number(event.dataTransfer.getData('text/plain')),ticket=state.tickets.find(row=>row.id===id);if(ticket&&ticket.status!==column.dataset.dropStatus)await manageTicket(id,{status:column.dataset.dropStatus})};
  });
}
function updateSelectedCount(){$('selected-count').textContent=`${state.selected.size} selected`}
function renderAlternateBoards(){
  const now=new Date(),today=new Date(now);today.setHours(0,0,0,0);
  const active=visibleTickets().filter(ticket=>ticket.status!=='Resolved'),due=ticket=>new Date(new Date(ticket.created_at).getTime()+(ticket.sla_hours||8)*36e5),fmt=new Intl.DateTimeFormat('en-US',{weekday:'short',day:'numeric'});
  const columns=[{label:'Overdue',tone:'overdue',test:date=>date<now}];
  for(let offset=0;offset<6;offset++){const start=new Date(today);start.setDate(today.getDate()+offset);const end=new Date(start);end.setDate(start.getDate()+1);columns.push({label:offset===0?'Today':fmt.format(start),test:date=>date>=(offset===0?now:start)&&date<end})}
  $('calendar-board').innerHTML=`<p class="board-note">Active tickets grouped by SLA due time.</p><div class="calendar-grid">${columns.map(column=>{const rows=active.filter(ticket=>column.test(due(ticket)));return `<section class="${column.tone||''}"><header>${column.label}<b>${rows.length}</b></header>${rows.slice(0,6).map(t=>`<button data-open-ticket="${t.id}"><b>${esc(t.public_id)} · ${esc(t.priority)}</b><span>${esc(t.subject)}</span></button>`).join('')||'<p class="column-empty">Nothing due</p>'}${rows.length>6?`<small class="more">+${rows.length-6} more</small>`:''}</section>`}).join('')}</div>`;
  $('load-board').innerHTML=`<div class="load-grid">${state.overview.agents.map(row=>`<article><div><span>${esc(initials(row.label))}</span><strong>${esc(row.label)}</strong></div><b>${row.assigned} tickets</b><meter min="0" max="30" value="${Math.min(30,row.assigned)}"></meter><small>${row.resolved} resolved · ${Math.max(0,row.assigned-row.resolved)} active</small></article>`).join('')}</div>`;
  document.querySelectorAll('#calendar-board [data-open-ticket]').forEach(button=>button.onclick=()=>openTicket(Number(button.dataset.openTicket)));
}

function renderCustomers(filter=$('customer-search').value){
  const rows=state.overview.customers.filter(customer=>`${customer.display_name} ${customer.organization} ${customer.tier}`.toLowerCase().includes(filter.toLowerCase()));
  $('customer-grid').innerHTML=rows.map(customer=>{const open=state.tickets.filter(ticket=>ticket.customer_id===customer.id&&ticket.status!=='Resolved').length;return `<article class="customer-card"><header><span>${esc(initials(customer.display_name))}</span><i class="health ${customer.health_score<70?'risk':''}" title="Health score">${customer.health_score}</i></header><h3>${esc(customer.display_name)}</h3><p>${esc(customer.organization)}</p><div><span>${esc(customer.tier)}</span><span>${open} open ticket${open===1?'':'s'}</span></div><div class="customer-actions"><button class="button outline" data-open-customer="${customer.id}">View history</button><button class="button primary" data-customer-ticket="${customer.id}" aria-label="New ticket for ${esc(customer.display_name)}">＋ Ticket</button></div></article>`}).join('')||'<p class="empty-state">No customers match your search.</p>';
  document.querySelectorAll('[data-open-customer]').forEach(button=>button.onclick=()=>openCustomer(Number(button.dataset.openCustomer)));
  document.querySelectorAll('[data-customer-ticket]').forEach(button=>button.onclick=()=>openNewTicket({customerId:Number(button.dataset.customerTicket)}));
}
function renderKnowledge(filter=$('knowledge-search').value){
  const all=state.overview.articles,articles=all.filter(article=>`${article.title} ${article.category} ${article.status}`.toLowerCase().includes(filter.toLowerCase())),published=all.filter(row=>row.status==='Published'),views=all.reduce((sum,row)=>sum+row.views,0),helpful=Math.round(published.reduce((sum,row)=>sum+row.helpful_percent,0)/Math.max(1,published.length));
  $('article-views').textContent=views.toLocaleString();$('helpful-score').textContent=`${helpful}%`;
  $('article-list').innerHTML=articles.map(article=>`<article class="${article.status==='Draft'?'draft':''}"><span>◇</span><div><small>${esc(article.category)}${article.status==='Draft'?' · <b class="draft-chip">Draft</b>':''}</small><h3>${esc(article.title)}</h3><p>${esc(article.excerpt)}</p></div><div><strong>${article.views.toLocaleString()}</strong><small>views</small></div><div><strong>${article.helpful_percent}%</strong><small>helpful</small></div><button class="icon-btn" data-open-article="${article.id}" aria-label="Open ${esc(article.title)}">→</button></article>`).join('')||'<p class="empty-state">No articles match your search.</p>';
  document.querySelectorAll('[data-open-article]').forEach(button=>button.onclick=()=>openArticle(Number(button.dataset.openArticle)));
}
function renderAutomations(){
  const manage=can('admin','supervisor');$('automation-new').hidden=!manage;
  $('automation-list').innerHTML=state.overview.automations.map(rule=>`<article class="${rule.active?'':'paused'}"><div class="automation-icon">⚡</div><div><span class="admin-status ${rule.active?'active':''}">${rule.active?'Active':'Paused'}</span><h3>${esc(rule.name)}</h3><p><b>When</b> ${esc(rule.trigger_label)} <i>→</i> <b>Then</b> ${esc(rule.action_label)}</p></div><span class="run-count">${rule.run_count}<small>runs</small></span><div class="automation-actions">${manage?`<button class="switch" type="button" role="switch" aria-checked="${rule.active}" data-toggle-rule="${rule.id}" aria-label="${rule.active?'Pause':'Activate'} ${esc(rule.name)}"><i></i></button>`:''}<button class="button outline" data-run-rule="${rule.id}" ${!manage||!rule.active?'disabled':''} title="${!manage?'Supervisors and admins can run rules':!rule.active?'Activate the rule to run it':'Run a safe simulation'}">Run now</button>${manage?`<button class="icon-btn" data-edit-rule="${rule.id}" aria-label="Edit ${esc(rule.name)}">✎</button><button class="icon-btn danger" data-delete-rule="${rule.id}" aria-label="Delete ${esc(rule.name)}">✕</button>`:''}</div></article>`).join('')||'<p class="empty-state">No automation rules yet.</p>';
  document.querySelectorAll('[data-run-rule]').forEach(button=>button.onclick=()=>runAutomation(Number(button.dataset.runRule),button));
  document.querySelectorAll('[data-toggle-rule]').forEach(button=>button.onclick=()=>toggleAutomation(Number(button.dataset.toggleRule)));
  document.querySelectorAll('[data-edit-rule]').forEach(button=>button.onclick=()=>automationForm(state.overview.automations.find(rule=>rule.id===Number(button.dataset.editRule))));
  document.querySelectorAll('[data-delete-rule]').forEach(button=>button.onclick=()=>deleteAutomation(Number(button.dataset.deleteRule)));
}
function renderReports(){const s=state.overview.summary;$('report-first-response').textContent=`${s.first_response_minutes}m`;$('report-resolution').textContent=`${s.resolution_hours}h`;$('report-reopen').textContent=`${s.reopen_rate}%`;$('report-csat').textContent=`${s.csat}%`;const max=Math.max(1,...state.overview.hourly.map(row=>row.value));$('hourly-chart').innerHTML=state.overview.hourly.map(row=>`<div title="${row.hour}:00 · ${row.value} tickets"><i data-style="height:${Math.max(8,Math.round(row.value/max*100))}%"></i><span>${String(row.hour).padStart(2,'0')}</span></div>`).join('');$('agent-table').innerHTML='<div class="agent-table-head"><span>Agent</span><span>Assigned</span><span>Resolved</span><span>Resolution</span></div>'+state.overview.agents.map(row=>`<div><strong>${esc(row.label)}</strong><span>${row.assigned}</span><span>${row.resolved}</span><b>${Math.round(row.resolved/Math.max(1,row.assigned)*100)}%</b></div>`).join('')}
function renderSecurity(){$('active-session-count').textContent=state.overview.activeSessions;$('security-events').innerHTML=state.overview.securityEvents.length?state.overview.securityEvents.map(event=>`<div><span>✓</span><div><strong>${esc(event.event_type.replaceAll('_',' '))}</strong><small>${esc(event.display_name||state.user.displayName)} · ${esc(event.detail)}</small></div><time>${dateTime(event.created_at)}</time></div>`).join(''):'<p class="empty-state">No security events recorded yet.</p>'}
function renderNotifications(){const rows=state.overview.notifications,unread=rows.filter(row=>!row.read_at).length;$('notification-count').textContent=unread;$('notification-count').hidden=!unread;$('mark-read').disabled=!unread;$('clear-notifications').disabled=!rows.length;$('notification-list').innerHTML=rows.map(row=>`<article class="${row.read_at?'read':''}"><i class="${row.kind}">${row.kind==='warning'?'!':'✓'}</i><div><strong>${esc(row.title)}</strong><p>${esc(row.body)}</p><time>${dateTime(row.created_at)}</time></div><div class="notification-actions">${row.read_at?'':`<button class="notification-action" data-read-notification="${row.id}" aria-label="Mark as read">✓</button>`}<button class="notification-action delete" data-delete-notification="${row.id}" aria-label="Delete notification">×</button></div></article>`).join('')||'<p class="empty-state">You are all caught up.</p>';document.querySelectorAll('[data-read-notification]').forEach(button=>button.onclick=()=>updateNotification(Number(button.dataset.readNotification),'read'));document.querySelectorAll('[data-delete-notification]').forEach(button=>button.onclick=()=>updateNotification(Number(button.dataset.deleteNotification),'delete'))}
function renderAll(){renderMetrics();renderCapacity();renderBacklog();renderKanban();renderCustomers();renderKnowledge();renderAutomations();renderReports();renderSecurity();renderNotifications()}

function fillSuiteSelect(id,items){const select=$(id);select.innerHTML=items.map(item=>`<option value="${item.id}">${esc(item.name)}</option>`).join('')}
function closeDialogs(){document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close())}
function openNewTicket(prefill={}){
  const form=$('suite-ticket-form');form.reset();$('suite-ticket-error').textContent='';
  $('suite-ticket-customer').innerHTML='<option value="">No customer</option>'+state.overview.customers.map(customer=>`<option value="${customer.id}">${esc(customer.display_name)} · ${esc(customer.organization)}</option>`).join('');
  if(prefill.customerId)$('suite-ticket-customer').value=String(prefill.customerId);
  if(state.user.role==='agent')$('suite-ticket-group').value=state.user.groupId;
  closeDialogs();$('suite-ticket-dialog').showModal();requestAnimationFrame(()=>form.elements.subject.focus());
}
async function createSuiteTicket(event){
  event.preventDefault();const form=event.currentTarget,submit=form.querySelector('[type="submit"]'),values=Object.fromEntries(new FormData(form));submit.disabled=true;
  try{const data=await api('/api/tickets',{method:'POST',body:JSON.stringify(values)});form.reset();$('suite-ticket-dialog').close();state.customerFilter=null;$('ticket-search').value='';$('ticket-filter').value='all';await refresh();showView('kanban');announce(`${data.ticket.public_id} created and added to the board.`);await openTicket(data.ticket.id)}
  catch(error){$('suite-ticket-error').textContent=error.message}finally{submit.disabled=false}
}
function openContentDialog(kicker,title,body){$('content-dialog-kicker').textContent=kicker;$('content-dialog-title').textContent=title;$('content-dialog-body').innerHTML=body;if(!$('content-dialog').open){closeDialogs();$('content-dialog').showModal()}}
function openCustomer(id){
  const customer=state.overview.customers.find(row=>row.id===id);if(!customer)return;
  const tickets=state.tickets.filter(ticket=>ticket.customer_id===id),active=tickets.filter(ticket=>ticket.status!=='Resolved');
  openContentDialog('CUSTOMER 360',customer.display_name,`<p>${esc(customer.organization)} · ${esc(customer.tier)}</p><div class="content-summary"><div><strong>${tickets.length}</strong><small>Total tickets</small></div><div><strong>${active.length}</strong><small>Active</small></div><div><strong>${customer.health_score}%</strong><small>Health</small></div></div>${tickets.length?`<h3 class="dialog-subhead">Recent tickets</h3><div class="mini-ticket-list">${tickets.slice(0,5).map(t=>`<button type="button" data-dialog-ticket="${t.id}"><b>${esc(t.public_id)}</b><span>${esc(t.subject)}</span><em class="status ${t.status}">${t.status}</em></button>`).join('')}</div>`:'<p class="empty-state">No tickets for this customer yet.</p>'}<div class="dialog-actions"><button class="button outline" id="customer-edit">Edit customer</button>${tickets.length?'<button class="button outline" id="customer-ticket-history">Show on board</button>':''}<button class="button primary" id="customer-new-ticket">＋ New ticket</button></div>`);
  document.querySelectorAll('[data-dialog-ticket]').forEach(button=>button.onclick=()=>openTicket(Number(button.dataset.dialogTicket)));
  $('customer-edit').onclick=()=>customerForm(customer);
  $('customer-new-ticket').onclick=()=>openNewTicket({customerId:customer.id});
  if($('customer-ticket-history'))$('customer-ticket-history').onclick=()=>{state.customerFilter=customer;$('content-dialog').close();renderKanban();showView('kanban');announce(`Showing tickets for ${customer.display_name}.`)};
}
function customerForm(customer){
  openForm({kicker:'CUSTOMER 360',title:customer?'Edit customer':'Add a customer',submit:customer?'Save changes':'Add customer',fields:[
    {name:'displayName',label:'Contact name',required:true,minlength:2,maxlength:120,value:customer?.display_name,placeholder:'e.g. Alex Rivera'},
    {name:'organization',label:'Organisation',required:true,minlength:2,maxlength:120,value:customer?.organization,placeholder:'Fictional company'},
    {name:'tier',label:'Tier',type:'select',options:['Standard','Premium','Enterprise'],value:customer?.tier||'Standard'},
    {name:'healthScore',label:'Health score (0–100)',type:'number',min:0,max:100,value:customer?.health_score??80}
  ],onSubmit:async values=>{values.healthScore=Number(values.healthScore);const data=await api(customer?`/api/customers/${customer.id}`:'/api/customers',{method:customer?'PATCH':'POST',body:JSON.stringify(values)});await refresh();announce(customer?'Customer updated.':`${data.customer.display_name} added to customers.`)}});
}
async function openArticle(id,countView=true){
  const article=state.overview.articles.find(row=>row.id===id);if(!article)return;
  if(countView){try{const data=await api(`/api/knowledge/${id}/view`,{method:'POST'});Object.assign(article,data.article);renderKnowledge()}catch{/* view counting is best effort */}}
  const manage=can('admin','supervisor');
  openContentDialog(article.category,article.title,`<p class="article-body">${esc(article.excerpt)}</p><div class="content-summary"><div><strong>${article.views.toLocaleString()}</strong><small>Views</small></div><div><strong>${article.helpful_percent}%</strong><small>Helpful</small></div><div><strong>${esc(article.status)}</strong><small>Status</small></div></div><div class="article-feedback"><span>Was this article helpful?</span><button type="button" class="button outline" data-article-feedback="1">Yes</button><button type="button" class="button outline" data-article-feedback="0">No</button></div><div class="dialog-actions">${manage?`<button class="button outline danger" id="article-delete">Delete</button><button class="button outline" id="article-publish">${article.status==='Published'?'Move to draft':'Publish'}</button>`:''}<button class="button outline" id="article-edit">Edit</button><button class="button primary" id="article-copy">Copy for reply</button></div>`);
  document.querySelectorAll('[data-article-feedback]').forEach(button=>button.onclick=async()=>{try{const data=await api(`/api/knowledge/${id}/feedback`,{method:'POST',body:JSON.stringify({helpful:button.dataset.articleFeedback==='1'})});Object.assign(article,data.article);renderKnowledge();document.querySelectorAll('[data-article-feedback]').forEach(node=>node.disabled=true);announce('Thanks — feedback recorded.')}catch(error){announce(error.message,'error')}});
  $('article-edit').onclick=()=>articleForm(article);
  $('article-copy').onclick=async()=>{try{await navigator.clipboard.writeText(`${article.title}\n\n${article.excerpt}`);announce('Article copied. Paste it into a ticket reply.')}catch{announce('Clipboard is unavailable in this browser.','error')}};
  if(!manage)return;
  $('article-publish').onclick=async()=>{const next=article.status==='Published'?'Draft':'Published';try{await api(`/api/knowledge/${id}`,{method:'PATCH',body:JSON.stringify({status:next})});await refresh();openArticle(id,false);announce(next==='Published'?'Article published.':'Article moved to drafts.')}catch(error){announce(error.message,'error')}};
  $('article-delete').onclick=async()=>{if(!await confirmAction('Delete this article?',`“${article.title}” will be removed from the knowledge base.`))return;try{await api(`/api/knowledge/${id}`,{method:'DELETE'});$('content-dialog').close();await refresh();announce('Article deleted.')}catch(error){announce(error.message,'error')}};
}
function articleForm(article){
  const manage=can('admin','supervisor'),fields=[
    {name:'title',label:'Title',required:true,minlength:4,maxlength:180,value:article?.title,wide:true,placeholder:'e.g. How to request a refund'},
    {name:'category',label:'Category',required:true,maxlength:80,value:article?.category||'General',list:[...new Set(state.overview.articles.map(row=>row.category))]}
  ];
  fields.push(manage?{name:'status',label:'Status',type:'select',options:['Published','Draft'],value:article?.status||'Published'}:{name:'note',label:'Status',type:'static',value:article?article.status:'Draft — a supervisor publishes it'});
  fields.push({name:'excerpt',label:'Content',type:'textarea',required:true,minlength:10,maxlength:4000,rows:7,wide:true,value:article?.excerpt,placeholder:'Write the answer customers and agents should see…'});
  openForm({kicker:'KNOWLEDGE BASE',title:article?'Edit article':'New article',submit:article?'Save article':'Create article',fields,onSubmit:async values=>{const data=await api(article?`/api/knowledge/${article.id}`:'/api/knowledge',{method:article?'PATCH':'POST',body:JSON.stringify(values)});await refresh();announce(article?'Article updated.':`“${data.article.title}” ${data.article.status==='Published'?'published':'saved as a draft'}.`)}});
}
async function updateNotification(id,action){
  try{
    await api(`/api/notifications/${id}${action==='read'?'/read':''}`,{method:action==='read'?'PATCH':'DELETE'});
    if(action==='read'){const row=state.overview.notifications.find(item=>item.id===id);if(row)row.read_at=new Date().toISOString()}
    else state.overview.notifications=state.overview.notifications.filter(item=>item.id!==id);
    renderNotifications();announce(action==='read'?'Notification marked as read.':'Notification deleted.');
  }catch(error){announce(error.message,'error')}
}
async function clearNotifications(){
  if(!state.overview.notifications.length)return;
  if(!await confirmAction('Clear all notifications?','Every notification in your inbox will be deleted.','Clear all'))return;
  try{await api('/api/notifications',{method:'DELETE'});state.overview.notifications=[];renderNotifications();announce('All notifications cleared.')}catch(error){announce(error.message,'error')}
}
function fieldHtml(field){
  const id=`field-${field.name}`,attrs=`id="${id}" name="${field.name}" ${field.required?'required':''} ${field.minlength?`minlength="${field.minlength}"`:''} ${field.maxlength?`maxlength="${field.maxlength}"`:''}`;
  let control;
  if(field.type==='static')control=`<p class="static-field">${esc(field.value)}</p>`;
  else if(field.type==='select')control=`<select ${attrs}>${field.options.map(option=>{const [value,label]=Array.isArray(option)?option:[option,option];return `<option value="${esc(value)}" ${String(value)===String(field.value??'')?'selected':''}>${esc(label)}</option>`}).join('')}</select>`;
  else if(field.type==='textarea')control=`<textarea ${attrs} rows="${field.rows||5}" placeholder="${esc(field.placeholder||'')}">${esc(field.value??'')}</textarea>`;
  else control=`<input ${attrs} type="${field.type||'text'}" value="${esc(field.value??'')}" placeholder="${esc(field.placeholder||'')}" ${field.min!=null?`min="${field.min}"`:''} ${field.max!=null?`max="${field.max}"`:''} ${field.list?`list="${id}-list"`:''}>${field.list?`<datalist id="${id}-list">${field.list.map(item=>`<option value="${esc(item)}"></option>`).join('')}</datalist>`:''}`;
  return field.type==='static'?`<div class="form-static ${field.wide?'wide':''}"><span>${esc(field.label)}</span>${control}</div>`:`<label class="${field.wide?'wide':''}" for="${id}"><span>${esc(field.label)}</span>${control}</label>`;
}
function openForm({kicker,title,submit='Save',fields,onSubmit}){
  $('form-dialog-kicker').textContent=kicker;$('form-dialog-title').textContent=title;$('form-dialog-submit').textContent=submit;$('form-dialog-error').textContent='';
  $('form-dialog-fields').innerHTML=fields.map(fieldHtml).join('');
  const form=$('form-dialog-form');
  form.onsubmit=async event=>{
    event.preventDefault();
    if(!form.checkValidity()){const invalid=form.querySelector(':invalid');$('form-dialog-error').textContent=`${invalid.closest('label')?.querySelector('span')?.textContent||'A field'}: ${invalid.validationMessage}`;invalid.focus();return}
    const button=$('form-dialog-submit');button.disabled=true;
    try{await onSubmit(Object.fromEntries(new FormData(form)),form);$('form-dialog').close()}catch(error){$('form-dialog-error').textContent=error.message}finally{button.disabled=false}
  };
  closeDialogs();$('form-dialog').showModal();requestAnimationFrame(()=>form.querySelector('input,textarea,select')?.focus());
}
function confirmAction(title,message,confirmLabel='Delete'){
  return new Promise(resolve=>{
    const dialog=$('confirm-dialog');let settled=false;
    $('confirm-title').textContent=title;$('confirm-message').textContent=message;$('confirm-accept').textContent=confirmLabel;
    const finish=value=>{if(settled)return;settled=true;if(dialog.open)dialog.close();resolve(value)};
    $('confirm-accept').onclick=()=>finish(true);$('confirm-cancel').onclick=()=>finish(false);dialog.onclose=()=>finish(false);
    dialog.showModal();requestAnimationFrame(()=>$('confirm-cancel').focus());
  });
}

const tourSteps=[
  {view:'command',title:'Command center',copy:'Start with service health, workload and the next best actions for your team.'},
  {view:'kanban',title:'Work the queue',copy:'Create tickets, drag them between stages, open conversations and resolve work from the board.'},
  {view:'customers',title:'Understand customers',copy:'Review relationship health and open each customer’s filtered support history.'},
  {view:'automation',title:'Automate safely',copy:'Supervisors and admins can run workflow simulations and review the resulting notifications.'},
  {view:'reports',title:'Measure outcomes',copy:'Inspect operational metrics, print a report or export the current analytics to CSV.'}
];
function renderTourStep(){const step=tourSteps[state.tourIndex];showView(step.view);$('tour-progress').textContent=`${state.tourIndex+1} OF ${tourSteps.length}`;$('tour-title').textContent=step.title;$('tour-copy').textContent=step.copy;$('tour-previous').disabled=state.tourIndex===0;$('tour-next').textContent=state.tourIndex===tourSteps.length-1?'Finish':'Next'}
function startTour(){state.tourIndex=0;renderTourStep();$('tour-dialog').showModal()}
function moveTour(direction){if(direction>0&&state.tourIndex===tourSteps.length-1){$('tour-dialog').close();announce('Tour complete. Your workspace is ready.');return}state.tourIndex=Math.max(0,Math.min(tourSteps.length-1,state.tourIndex+direction));renderTourStep()}

async function openTicket(id){
  try{
    const data=await api(`/api/tickets/${id}/detail`),t=data.ticket,status=t.status;
    $('detail-id').textContent=`${t.public_id} · ${status}`;$('detail-subject').textContent=t.subject;
    const quick=status==='Resolved'?'<button type="button" class="button outline" data-quick-status="Open">Reopen</button>':`${status==='Open'?'<button type="button" class="button outline" data-quick-status="In progress">Start work</button>':''}<button type="button" class="button primary" data-quick-status="Resolved">Resolve</button>`;
    $('detail-content').innerHTML=`<div class="detail-layout"><section><div class="customer-context"><span>${esc(initials(t.customer_name||'Demo Customer'))}</span><div><strong>${esc(t.customer_name||'No linked customer')}</strong><small>${esc(t.organization||'Synthetic account')} · ${esc(t.tier||'Standard')} · ${esc(t.channel)}</small></div></div>${t.description?`<p class="ticket-description">${esc(t.description)}</p>`:'<p class="ticket-description muted">No description was provided.</p>'}<h3>Conversation</h3><div class="conversation">${data.comments.map(comment=>`<article class="${comment.visibility}"><header><strong>${esc(comment.author_name||'Former user')}</strong><span>${esc(comment.visibility)} · ${dateTime(comment.created_at)}</span></header><p>${esc(comment.body)}</p></article>`).join('')||'<p class="empty-state">No conversation yet. Send the first reply below.</p>'}</div><form id="comment-form"><textarea name="body" required minlength="2" placeholder="Write a reply or internal note…"></textarea><div><select name="visibility"><option value="public">Public reply</option><option value="internal">Internal note</option></select>${status!=='Resolved'?'<label class="switch-line"><input type="checkbox" name="resolve"> Resolve after sending</label>':''}<button class="button primary">Send</button></div></form></section><aside><div class="quick-actions">${quick}${t.assigned_user_id!==state.user.id?'<button type="button" class="button outline" id="detail-assign-me">Assign to me</button>':''}</div><form id="manage-form"><label>Status<select name="status">${['Open','In progress','Resolved'].map(value=>`<option ${value===status?'selected':''}>${value}</option>`).join('')}</select></label><label>Priority<select name="priority">${['Critical','High','Medium','Low'].map(value=>`<option ${value===t.priority?'selected':''}>${value}</option>`).join('')}</select></label><label>Assignee<select name="assignedUserId" ${state.user.role==='agent'?'disabled title="Supervisors assign tickets"':''}><option value="">Unassigned</option>${data.users.map(user=>`<option value="${user.id}" ${user.id===t.assigned_user_id?'selected':''}>${esc(user.display_name)}</option>`).join('')}</select></label><label>Group<select name="groupId" ${state.user.role==='agent'?'disabled':''}>${state.meta.groups.map(group=>`<option value="${group.id}" ${group.id===t.group_id?'selected':''}>${esc(group.name)}</option>`).join('')}</select></label><label>Tags<input name="tags" value="${esc((t.tags||[]).join(', '))}" placeholder="refund, vip"></label><label class="switch-line"><input type="checkbox" name="paused" ${t.sla_paused_at?'checked':''}> Pause SLA</label><label class="switch-line"><input type="checkbox" name="escalated" ${t.escalated?'checked':''}> Escalated</label><button class="button primary full">Save changes</button></form><h3>Activity</h3><div class="event-list">${data.events.map(event=>`<div><i></i><span><strong>${esc(event.event_type)}</strong><small>${esc(event.detail)} · ${esc(event.actor_name||'System')} · ${dateTime(event.created_at)}</small></span></div>`).join('')||'<p>No activity yet.</p>'}</div></aside></div>`;
    if(!$('ticket-detail').open){closeDialogs();$('ticket-detail').showModal()}
    $('comment-form').onsubmit=async event=>{
      event.preventDefault();const submit=event.currentTarget.querySelector('.button.primary'),form=Object.fromEntries(new FormData(event.currentTarget)),resolve=form.resolve==='on';delete form.resolve;submit.disabled=true;
      try{await api(`/api/tickets/${id}/comments`,{method:'POST',body:JSON.stringify(form)});if(resolve)await api(`/api/tickets/${id}/manage`,{method:'PATCH',body:JSON.stringify({status:'Resolved'})});announce(resolve?'Reply sent and ticket resolved.':form.visibility==='internal'?'Internal note added.':'Reply sent.');await refresh();openTicket(id)}
      catch(error){announce(error.message,'error');submit.disabled=false}
    };
    document.querySelectorAll('[data-quick-status]').forEach(button=>button.onclick=async()=>{button.disabled=true;await manageTicket(id,{status:button.dataset.quickStatus});openTicket(id)});
    if($('detail-assign-me'))$('detail-assign-me').onclick=async()=>{await manageTicket(id,{assignedUserId:state.user.id});openTicket(id)};
    $('manage-form').onsubmit=async event=>{event.preventDefault();const fd=new FormData(event.currentTarget),form=Object.fromEntries(fd);form.tags=String(form.tags||'').split(',').map(tag=>tag.trim()).filter(Boolean);form.paused=fd.has('paused');form.escalated=fd.has('escalated');if(state.user.role==='agent'){delete form.assignedUserId;delete form.groupId}await manageTicket(id,form);openTicket(id)};
  }catch(error){announce(error.message,'error')}
}
async function manageTicket(id,changes){
  try{
    await api(`/api/tickets/${id}/manage`,{method:'PATCH',body:JSON.stringify(changes)});await refresh();
    const ticket=state.tickets.find(row=>row.id===id),keys=Object.keys(changes);
    announce(keys.length===1&&changes.status?`${ticket?.public_id||'Ticket'} moved to ${changes.status}.`:keys.length===1&&changes.assignedUserId===state.user.id?'Ticket assigned to you.':'Ticket updated.');
  }catch(error){announce(error.message,'error')}
}
async function runAutomation(id,button){button.disabled=true;try{const data=await api(`/api/automations/${id}/run`,{method:'POST'});announce(data.message);await refresh()}catch(error){announce(error.message,'error');button.disabled=false}}
async function toggleAutomation(id){const rule=state.overview.automations.find(row=>row.id===id);if(!rule)return;try{await api(`/api/automations/${id}`,{method:'PATCH',body:JSON.stringify({active:!rule.active})});await refresh();announce(`${rule.name} ${rule.active?'paused':'activated'}.`)}catch(error){announce(error.message,'error')}}
async function deleteAutomation(id){const rule=state.overview.automations.find(row=>row.id===id);if(!rule||!await confirmAction('Delete this rule?',`“${rule.name}” and its run history will be removed.`))return;try{await api(`/api/automations/${id}`,{method:'DELETE'});await refresh();announce('Automation rule deleted.')}catch(error){announce(error.message,'error')}}
function automationForm(rule){
  openForm({kicker:'WORKFLOW ENGINE',title:rule?'Edit automation rule':'New automation rule',submit:rule?'Save rule':'Create rule',fields:[
    {name:'name',label:'Rule name',required:true,minlength:3,maxlength:120,value:rule?.name,wide:true,placeholder:'e.g. Escalate stale critical tickets'},
    {name:'trigger',label:'When…',required:true,minlength:3,maxlength:160,value:rule?.trigger_label,wide:true,list:['A ticket is created','Critical ticket waits 30 minutes','Ticket is resolved','Customer replies to a pending ticket','SLA is 80% consumed'],placeholder:'Choose or describe a trigger'},
    {name:'action',label:'Then…',required:true,minlength:3,maxlength:160,value:rule?.action_label,wide:true,list:['Notify the team lead','Assign to the least busy agent','Send a satisfaction survey','Add the tag “follow-up”','Escalate to a supervisor'],placeholder:'Choose or describe an action'},
    {name:'active',label:'State',type:'select',options:[['true','Active'],['false','Paused']],value:String(rule?.active??true)}
  ],onSubmit:async values=>{values.active=values.active==='true';await api(rule?`/api/automations/${rule.id}`:'/api/automations',{method:rule?'PATCH':'POST',body:JSON.stringify(values)});await refresh();announce(rule?'Automation rule updated.':'Automation rule created.')}});
}

const commands=[['Command center','command','⌂'],['Ticket board','kanban','▦'],['Customers','customers','◎'],['Knowledge base','knowledge','◇'],['Automation rules','automation','⚡'],['Executive reports','reports','◉'],['Security center','security','⌾'],['Jira integration','integration','↗'],['Preferences','preferences','⚙']];
function commandActions(){
  const actions=[['New ticket','＋',()=>openNewTicket()],['New customer','◎',()=>customerForm()],['New knowledge article','◇',()=>articleForm()],[`Toggle dark mode (now ${prefs.isDark()?'on':'off'})`,'◐',()=>prefs.toggleTheme()],[`Toggle compact density (now ${prefs.get().compact?'on':'off'})`,'↕',()=>prefs.toggle('compact')],['Preferences and appearance','⚙',()=>showView('preferences')],['Open notifications','♢',()=>setNotificationDrawer(true)],['Export executive report (CSV)','⇩',()=>downloadReport()]];
  if(can('admin','supervisor'))actions.push(['New automation rule','⚡',()=>automationForm()]);
  return actions;
}
function openCommands(){if($('command-dialog').open)return;closeDialogs();$('command-search').value='';renderCommands('');$('command-dialog').showModal();setTimeout(()=>$('command-search').focus(),50)}
function renderCommands(query){
  const q=query.trim().toLowerCase(),match=label=>label.toLowerCase().includes(q);
  const results=[...commands.filter(([label])=>match(label)).map(([label,view,icon])=>({label,icon,hint:'Go to',run:()=>showView(view)})),...commandActions().filter(([label])=>match(label)).map(([label,icon,run])=>({label,icon,hint:'Action',run}))];
  if(q.length>=2)results.push(...state.tickets.filter(ticket=>`${ticket.public_id} ${ticket.subject}`.toLowerCase().includes(q)).slice(0,6).map(ticket=>({label:`${ticket.public_id} · ${ticket.subject}`,icon:'▤',hint:ticket.status,run:()=>openTicket(ticket.id)})));
  state.commandResults=results;state.commandIndex=0;
  $('command-results').innerHTML=results.map((result,index)=>`<button type="button" data-command-index="${index}" class="${index===0?'active':''}"><span>${result.icon}</span><strong>${esc(result.label)}</strong><small>${esc(result.hint)}</small><kbd>↵</kbd></button>`).join('')||'<p class="empty-state">No matching modules, actions or tickets.</p>';
  document.querySelectorAll('[data-command-index]').forEach(button=>{button.onclick=()=>runCommand(Number(button.dataset.commandIndex));button.onmouseenter=()=>highlightCommand(Number(button.dataset.commandIndex))});
}
function highlightCommand(index){state.commandIndex=index;document.querySelectorAll('[data-command-index]').forEach(button=>button.classList.toggle('active',Number(button.dataset.commandIndex)===index));document.querySelector(`[data-command-index="${index}"]`)?.scrollIntoView({block:'nearest'})}
function runCommand(index){const result=state.commandResults[index];if(!result)return;$('command-dialog').close();result.run()}
function downloadReport(){const rows=[['Metric','Value'],['Total tickets',state.overview.summary.total],['Active tickets',state.overview.summary.active],['First response (minutes)',state.overview.summary.first_response_minutes],['Resolution (hours)',state.overview.summary.resolution_hours],['Reopen rate',`${state.overview.summary.reopen_rate}%`],['CSAT',`${state.overview.summary.csat}%`]],csv=rows.map(row=>row.map(value=>`"${String(value).replaceAll('"','""')}"`).join(',')).join('\r\n'),url=URL.createObjectURL(new Blob([csv],{type:'text/csv'})),link=document.createElement('a');link.href=url;link.download='supportops-executive-report.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),500);announce('Executive report exported.')}

function bindEvents(){
  bindSuiteRail();
  addEventListener('hashchange',()=>{const view=location.hash.slice(1);if(viewCopy[view]&&view!==state.activeView)showView(view)});
  document.querySelectorAll('.suite-nav').forEach(button=>button.onclick=()=>showView(button.dataset.view));
  document.querySelectorAll('[data-jump]').forEach(button=>button.onclick=()=>{if(button.dataset.filter)setTicketFilter(button.dataset.filter);showView(button.dataset.jump)});
  $('command-open').onclick=openCommands;$('command-search').oninput=event=>renderCommands(event.target.value);
  $('command-search').onkeydown=event=>{const count=state.commandResults.length;if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();if(count)highlightCommand((state.commandIndex+(event.key==='ArrowDown'?1:-1)+count)%count)}else if(event.key==='Enter'){event.preventDefault();runCommand(state.commandIndex)}};
  $('notification-open').onclick=()=>setNotificationDrawer(true);$('notification-close').onclick=()=>setNotificationDrawer(false);$('notification-scrim').onclick=()=>setNotificationDrawer(false);
  $('mark-read').onclick=async()=>{try{await api('/api/notifications/read',{method:'PATCH'});state.overview.notifications.forEach(row=>{row.read_at??=new Date().toISOString()});renderNotifications();announce('All notifications marked as read.')}catch(error){announce(error.message,'error')}};
  $('clear-notifications').onclick=clearNotifications;
  $('suite-new-ticket').onclick=()=>openNewTicket();$('suite-ticket-close').onclick=()=>$('suite-ticket-dialog').close();$('suite-ticket-form').onsubmit=createSuiteTicket;
  $('customer-search').oninput=event=>renderCustomers(event.target.value);$('knowledge-search').oninput=event=>renderKnowledge(event.target.value);
  $('ticket-scope-note').onclick=()=>{state.customerFilter=null;renderKanban();announce('Customer filter cleared.')};
  $('ticket-search').oninput=renderKanban;$('ticket-filter').onchange=renderKanban;$('bulk-clear').onclick=()=>{state.selected.clear();updateSelectedCount();renderKanban()};
  $('customer-new').onclick=()=>customerForm();$('article-new').onclick=()=>articleForm();$('automation-new').onclick=()=>automationForm();
  $('detail-close').onclick=()=>$('ticket-detail').close();$('content-dialog-close').onclick=()=>$('content-dialog').close();$('form-dialog-close').onclick=()=>$('form-dialog').close();$('form-dialog-cancel').onclick=()=>$('form-dialog').close();
  $('jira-connect').onclick=async()=>{await api('/api/integrations/jira',{method:'POST'});$('jira-dialog').showModal()};document.querySelectorAll('[data-close-jira]').forEach(button=>button.onclick=()=>$('jira-dialog').close());
  $('tour-start').onclick=startTour;$('tour-previous').onclick=()=>moveTour(-1);$('tour-next').onclick=()=>moveTour(1);document.querySelectorAll('[data-close-tour]').forEach(button=>button.onclick=()=>$('tour-dialog').close());
  document.querySelectorAll('[data-theme-choice]').forEach(button=>button.onclick=()=>changePreference({theme:button.dataset.themeChoice}));
  $('density-toggle').onclick=()=>changePreference({compact:!prefs.get().compact});$('motion-toggle').onclick=()=>changePreference({reduceMotion:!prefs.get().reduceMotion});
  $('preferences-reset').onclick=()=>{prefs.reset();announce('Preferences reset to defaults.')};
  $('print-report').onclick=()=>window.print();$('download-report').onclick=downloadReport;$('suite-logout').onclick=async()=>{await api('/api/auth/logout',{method:'POST'});location.assign('/login.html')};
  $('signout-others').onclick=async event=>{const button=event.currentTarget;button.disabled=true;try{const data=await api('/api/auth/sessions/revoke-others',{method:'POST'});await refresh();announce(data.revoked?`Signed out ${data.revoked} other session${data.revoked===1?'':'s'}.`:'No other sessions were active. Only this browser is signed in.')}catch(error){announce(error.message,'error')}finally{button.disabled=false}};
  document.querySelectorAll('[data-board]').forEach(button=>button.onclick=()=>switchBoard(button.dataset.board));$('bulk-apply').onclick=bulkUpdate;
  document.addEventListener('keydown',event=>{
    const active=document.activeElement,editable=['INPUT','TEXTAREA','SELECT'].includes(active.tagName)||active.isContentEditable,key=event.key.toLowerCase();
    if(event.key==='Escape'&&$('notification-drawer').classList.contains('open'))setNotificationDrawer(false);
    if((event.metaKey||event.ctrlKey)&&key==='k'){event.preventDefault();openCommands();return}
    if(editable||document.querySelector('dialog[open]')||event.metaKey||event.ctrlKey||event.altKey)return;
    if(event.shiftKey&&key==='d'){event.preventDefault();prefs.toggleTheme();announce(`${prefs.isDark()?'Dark':'Light'} mode on.`);return}
    if(key==='n'){event.preventDefault();openNewTicket();return}
    if(state.shortcutPrefix==='g'){state.shortcutPrefix=null;if(key==='t')showView('kanban');if(key==='r')showView('reports');return}
    if(key==='g'){state.shortcutPrefix='g';announce('Shortcut: press T for tickets or R for reports.');setTimeout(()=>state.shortcutPrefix=null,1200)}
  });
}
function switchBoard(name){state.board=name;document.querySelectorAll('[data-board]').forEach(button=>button.classList.toggle('active',button.dataset.board===name));$('kanban-board').hidden=name!=='kanban';$('calendar-board').hidden=name!=='calendar';$('load-board').hidden=name!=='load'}
async function bulkUpdate(){
  const status=$('bulk-status').value;if(!state.selected.size||!status)return announce('Select tickets and a bulk status.','error');
  try{const data=await api('/api/tickets/bulk',{method:'POST',body:JSON.stringify({ids:[...state.selected],status})});state.selected.clear();updateSelectedCount();$('bulk-status').value='';await refresh();announce(`${data.updated} ticket${data.updated===1?'':'s'} moved to ${status}.`)}catch(error){announce(error.message,'error')}
}
function syncPreferenceControls(current=prefs.get()){
  document.querySelectorAll('[data-theme-choice]').forEach(button=>{const on=button.dataset.themeChoice===current.theme;button.classList.toggle('active',on);button.setAttribute('aria-pressed',String(on))});
  for(const [key,id] of [['compact','density-toggle'],['reduceMotion','motion-toggle']]){const button=$(id),on=Boolean(current[key]);button.setAttribute('aria-pressed',String(on));button.querySelector('b').textContent=on?'On':'Off'}
}
const preferenceNames={compact:'Compact density',reduceMotion:'Reduced motion'};
function changePreference(changes){
  const next=prefs.set(changes),[key]=Object.keys(changes);
  announce(key==='theme'?`Theme set to ${next.theme}${next.theme==='system'?` (currently ${prefs.isDark()?'dark':'light'})`:''}. Applied across SupportOps.`:`${preferenceNames[key]} ${next[key]?'on':'off'}. Applied across SupportOps.`);
}
async function refresh(){
  const [overview,tickets]=await Promise.all([api('/api/suite/overview'),api('/api/tickets?sort=sla')]);
  state.overview=overview;state.tickets=tickets.tickets;
  for(const id of state.selected)if(!state.tickets.some(ticket=>ticket.id===id))state.selected.delete(id);
  renderAll();updateSelectedCount();
}
async function bootstrap(){try{syncPreferenceControls();prefs.onChange(syncPreferenceControls);const [auth,meta]=await Promise.all([api('/api/auth/me'),api('/api/meta')]);state.user=auth.user;state.permissions=auth.permissions;state.meta=meta;$('suite-user-name').textContent=state.user.displayName;$('suite-user-role').textContent=`${state.user.role.toUpperCase()} · ${state.user.groupName||'All groups'}`;$('suite-initials').textContent=state.user.displayName.split(/\s+/).map(word=>word[0]).join('').slice(0,2).toUpperCase();fillSuiteSelect('suite-ticket-category',meta.categories);fillSuiteSelect('suite-ticket-group',meta.groups);if(state.user.role==='agent'){$('suite-ticket-group').value=state.user.groupId;$('suite-ticket-group').disabled=true}bindEvents();await refresh();const requested=location.hash.slice(1);showView(viewCopy[requested]?requested:'command');setInterval(()=>{if(document.visibilityState==='visible'&&!document.querySelector('dialog[open]'))refresh().catch(()=>{})},60000)}catch(error){announce(error.message,'error')}}
bootstrap();
