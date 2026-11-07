/* Site-wide appearance preferences.
   Loaded synchronously as the first element of <body> on every page so the saved theme,
   density and motion settings apply before first paint, and stay in sync across tabs. */
(()=>{
  const KEY='supportops-preferences-v2';
  const DEFAULTS={theme:'light',compact:false,reduceMotion:false};
  const THEMES=['light','dark','system'];
  const systemDark=matchMedia('(prefers-color-scheme: dark)');
  const listeners=new Set();

  const storage=(() => {try{const probe='__supportops__';localStorage.setItem(probe,'1');localStorage.removeItem(probe);return localStorage}catch{return null}})();

  function migrateLegacy(){
    // Earlier versions stored each flag separately (and only in sessionStorage without consent).
    const legacy=name=>{try{return localStorage.getItem(`supportops-${name}`)??sessionStorage.getItem(`supportops-${name}`)}catch{return null}};
    const dark=legacy('dark'),compact=legacy('compact'),motion=legacy('reduce-motion');
    if(dark===null&&compact===null&&motion===null)return null;
    return {theme:dark==='true'?'dark':'light',compact:compact==='true',reduceMotion:motion==='true'};
  }
  function read(){
    let saved=null;
    try{saved=JSON.parse(storage?.getItem(KEY)||'null')}catch{saved=null}
    if(!saved){saved=migrateLegacy();if(saved)write(saved)}
    const prefs={...DEFAULTS,...(saved||{})};
    if(!THEMES.includes(prefs.theme))prefs.theme=DEFAULTS.theme;
    prefs.compact=Boolean(prefs.compact);prefs.reduceMotion=Boolean(prefs.reduceMotion);
    return prefs;
  }
  function write(prefs){try{storage?.setItem(KEY,JSON.stringify(prefs))}catch{/* storage full or blocked: keep in memory */}}

  let current=read();
  const isDark=(prefs=current)=>prefs.theme==='dark'||(prefs.theme==='system'&&systemDark.matches);

  function apply(){
    const dark=isDark(),body=document.body,root=document.documentElement;
    root.dataset.theme=dark?'dark':'light';
    root.dataset.motion=current.reduceMotion?'reduce':'full';
    root.style.colorScheme=dark?'dark':'light';
    if(body){
      body.classList.toggle('dark',dark);
      body.classList.toggle('compact',current.compact);
      body.classList.toggle('reduce-motion',current.reduceMotion);
    }
    const meta=document.querySelector('meta[name="theme-color"]');
    if(meta)meta.content=dark?'#0e1420':'#e9eff8';
  }
  function emit(){const detail={...current,dark:isDark()};listeners.forEach(fn=>{try{fn(detail)}catch(error){console.error(error)}});window.dispatchEvent(new CustomEvent('supportops:preferences',{detail}))}

  function set(changes){
    current={...current,...changes};
    if(!THEMES.includes(current.theme))current.theme=DEFAULTS.theme;
    write(current);apply();emit();
    return {...current};
  }

  window.SupportOpsPreferences={
    get:()=>({...current,dark:isDark()}),
    set,
    toggle:key=>set({[key]:!current[key]}),
    toggleTheme:()=>set({theme:isDark()?'light':'dark'}),
    reset:()=>set({...DEFAULTS}),
    onChange:fn=>{listeners.add(fn);return ()=>listeners.delete(fn)},
    isDark:()=>isDark()
  };

  // Another tab changed preferences, or the OS theme changed while following the system.
  window.addEventListener('storage',event=>{if(event.key===KEY){current=read();apply();emit()}});
  systemDark.addEventListener('change',()=>{if(current.theme==='system'){apply();emit()}});

  // The server's CSP forbids inline style attributes, so templates use data-style and we apply it through the CSSOM.
  const applyDataStyles=root=>{
    if(!(root instanceof Element))return;
    const nodes=root.matches('[data-style]')?[root,...root.querySelectorAll('[data-style]')]:root.querySelectorAll('[data-style]');
    for(const node of nodes){
      for(const declaration of node.dataset.style.split(';')){
        const index=declaration.indexOf(':');if(index<0)continue;
        node.style.setProperty(declaration.slice(0,index).trim(),declaration.slice(index+1).trim());
      }
      node.removeAttribute('data-style');
    }
  };
  new MutationObserver(records=>{for(const record of records)record.addedNodes.forEach(applyDataStyles)}).observe(document.documentElement,{childList:true,subtree:true});

  // Quick theme toggles on pages without the full preferences screen.
  document.addEventListener('click',event=>{
    const toggle=event.target.closest?.('[data-theme-toggle]');
    if(toggle){event.preventDefault();window.SupportOpsPreferences.toggleTheme()}
  });
  const syncToggles=()=>document.querySelectorAll('[data-theme-toggle]').forEach(button=>{
    const dark=isDark();button.setAttribute('aria-pressed',String(dark));
    const label=button.querySelector('[data-theme-label]');if(label)label.textContent=dark?'Light mode':'Dark mode';
  });
  listeners.add(syncToggles);

  apply();
  document.addEventListener('DOMContentLoaded',()=>{apply();syncToggles();applyDataStyles(document.body)});
})();
