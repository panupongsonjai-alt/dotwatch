function openDashboardPage(pageId,updateHash){
  const target=byId(pageId)||byId('overview');
  if(!target)return;
  document.querySelectorAll('.dashboard-page').forEach(page=>page.classList.toggle('is-active',page===target));
  document.querySelectorAll('[data-page-target]').forEach(item=>{
    const active=item.getAttribute('data-page-target')===target.id;
    item.classList.toggle('is-active',active);
    if(item.classList.contains('portal-nav-item'))item.setAttribute('aria-current',active?'page':'false');
  });
  const nav=document.querySelector('.portal-nav-item[data-page-target="'+target.id+'"]');
  setText('portalPageTitle',nav?.getAttribute('data-page-title')||target.getAttribute('data-page-title')||'Device Console');
  setText('portalPageSubtitle',nav?.getAttribute('data-page-subtitle')||target.getAttribute('data-page-subtitle')||'');
  document.body.setAttribute('data-active-page',target.id);
  document.body.classList.remove('nav-open');
  if(updateHash!==false&&location.hash!=='#'+target.id)history.replaceState(null,'','#'+target.id);
  window.scrollTo({top:0,behavior:'smooth'});
}

function initDashboardNavigation(){
  document.querySelectorAll('[data-page-target]').forEach(item=>item.addEventListener('click',event=>{
    event.preventDefault();
    openDashboardPage(item.getAttribute('data-page-target'),true);
  }));
  byId('portalMenuButton')?.addEventListener('click',()=>document.body.classList.toggle('nav-open'));
  byId('portalOverlay')?.addEventListener('click',()=>document.body.classList.remove('nav-open'));
  window.addEventListener('hashchange',()=>openDashboardPage(location.hash.replace('#','')||'overview',false));
  openDashboardPage(location.hash.replace('#','')||'overview',false);
}
