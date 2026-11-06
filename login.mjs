const form=document.getElementById('login-form');
const username=document.getElementById('username');
const password=document.getElementById('password');
const error=document.getElementById('login-error');
document.querySelectorAll('.demo-account').forEach(button=>button.addEventListener('click',()=>{username.value=button.dataset.user;password.value=button.dataset.password;error.textContent='';password.focus()}));
document.getElementById('toggle-password').addEventListener('click',event=>{const visible=password.type==='text';password.type=visible?'password':'text';event.currentTarget.setAttribute('aria-label',visible?'Show password':'Hide password')});
form.addEventListener('submit',async event=>{event.preventDefault();error.textContent='';const submit=form.querySelector('[type="submit"]');submit.disabled=true;submit.textContent='Signing in…';try{const response=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:username.value,password:password.value})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Sign in failed.');location.assign('/index.html')}catch(reason){error.textContent=reason.message;submit.disabled=false;submit.innerHTML='Sign in <span aria-hidden="true">→</span>'}});
