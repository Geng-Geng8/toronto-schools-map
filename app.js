import { BOARD_KEYS, LEVEL_KEYS, DEFAULT_FILTERS, normalizeQuery, filterSchools, countSchools, toGeoJSON, safeWebsite, directionsUrl, MARKER_STOPS, markerExpression, nearestFeature } from './utils.mjs';

const $ = id => document.getElementById(id);
const el = {
  search:$('search'), clear:$('clearSearch'), reset:$('resetBtn'), count:$('matchCount'), label:$('matchLabel'),
  resultsCount:$('resultsCount'), toggle:$('resultsToggle'), closeResults:$('closeResults'), resultsPanel:$('resultsPanel'),
  resultsList:$('resultsList'), resultsMeta:$('resultsMeta'), more:$('moreResults'),
  map:$('map'), loading:$('mapLoading'), fallback:$('mapFallback'), retry:$('retryMap'), viewAll:$('viewAllBtn'),
  legend:$('legend'), legendToggle:$('legendToggle'), legendContents:$('legendContents'),
  card:$('schoolCard'), closeCard:$('closeCard'), detailName:$('detailName'), category:$('detailCategory'),
  grades:$('detailGrades'), address:$('detailAddress'), phoneRow:$('detailPhoneRow'), phone:$('detailPhone'),
  directions:$('directionsBtn'), copy:$('copyBtn'), copyFeedback:$('copyFeedback'), website:$('websiteBtn'),
  info:$('infoBtn'), about:$('aboutDialog'), closeAbout:$('closeAbout')
};
const app = {
  schools:[], filtered:[], byId:new Map(), filters:{...DEFAULT_FILTERS}, q:'', selected:null,
  rendered:0, map:null, maplibre:null, mapReady:false, mapBusy:false, mapFailed:false,
  sourceReady:false, searchDebounce:null, copyReset:null, attributionObserver:null
};
const PAGE_SIZE=100;
const mobile=window.matchMedia('(max-width: 800px)');
let selectionOrigin=null;
function focusable(container) {
  return [...container.querySelectorAll('button:not([disabled]), a[href], input, [tabindex="0"]')].filter(node=>node.checkVisibility());
}
function syncResultsSheet() {
  const open=mobile.matches && el.resultsPanel.classList.contains('open');
  $('resultsBackdrop').hidden=!open;
  for(const node of document.querySelectorAll('.site-header, .filter-area, .desktop-footer, .map-panel')) node.inert=open;
  if(open){el.resultsPanel.setAttribute('role','dialog');el.resultsPanel.setAttribute('aria-modal','true');}
  else{el.resultsPanel.removeAttribute('role');el.resultsPanel.removeAttribute('aria-modal');}
}
mobile.addEventListener('change',()=>{setResultsOpen(false); app.map?.resize();});

function createSwatch(s) {
  const i=document.createElement('i');
  i.className=`result-swatch ${s.board==='TDSB'?'blue':'red'} ${s.level==='Elementary'?'circle':'square'}`;
  i.setAttribute('aria-hidden','true');return i;
}
function setResultsOpen(open,restoreFocus=true) {
  if(open && mobile.matches) closeSchool(false);
  const hadFocus=el.resultsPanel.contains(document.activeElement);
  el.resultsPanel.classList.toggle('open',open);
  el.toggle.setAttribute('aria-expanded',String(open));
  syncResultsSheet();
  if(open){el.more.hidden=app.rendered>=app.filtered.length;if(mobile.matches)el.closeResults.focus();}
  else if(hadFocus && restoreFocus)el.toggle.focus();
}
function updateSelectionRows() {
  for(const row of el.resultsList.querySelectorAll('.school-result')) {
    const active=Number(row.dataset.schoolId)===app.selected;
    row.classList.toggle('active',active);
    if(active) row.setAttribute('aria-current','true'); else row.removeAttribute('aria-current');
  }
}
function appendNextPage(count=PAGE_SIZE) {
  const end=Math.min(app.rendered+count,app.filtered.length);
  const frag=document.createDocumentFragment();
  for(let i=app.rendered;i<end;i++) {
    const s=app.filtered[i]; const row=document.createElement('button');
    row.type='button';row.className='school-result';row.dataset.schoolId=String(s.id);
    row.setAttribute('aria-label',`${s.name}, ${s.board}, ${s.level}, grades ${s.grades}, ${s.address}`);
    row.append(createSwatch(s));
    const content=document.createElement('span');
    const title=document.createElement('span');title.className='result-title';title.textContent=s.name;
    const meta=document.createElement('span');meta.className='result-meta';meta.textContent=`${s.board} · ${s.level} · Grades ${s.grades}`;
    content.append(title,meta);row.append(content);
    row.addEventListener('click',()=>{setResultsOpen(false,false);selectSchool(s.id,true,row);});
    frag.append(row);
  }
  el.resultsList.append(frag);
  app.rendered=end;
  el.resultsMeta.textContent=`Showing ${app.rendered} of ${app.filtered.length}`;
  el.more.hidden=app.rendered>=app.filtered.length;
  updateSelectionRows();
}
function revealSelectedRow() {
  if(mobile.matches || app.selected===null)return;
  const index=app.filtered.findIndex(s=>s.id===app.selected);
  if(index<0)return;
  if(index>=app.rendered)appendNextPage(Math.ceil((index+1-app.rendered)/PAGE_SIZE)*PAGE_SIZE);
  el.resultsList.querySelector(`[data-school-id="${app.selected}"]`)?.scrollIntoView({block:'nearest'});
}
function renderResults() {
  el.resultsList.replaceChildren();app.rendered=0;
  if(!app.filtered.length){const div=document.createElement('div');div.className='empty-results';
    const strong=document.createElement('strong');strong.textContent='No schools match';
    div.append(strong,document.createTextNode('Try another school name or street, or reset your filters.'));
    el.resultsList.append(div);el.more.hidden=true;el.resultsMeta.textContent='No matches';return;
  }
  appendNextPage();el.resultsList.scrollTop=0;
}
function updateLegend() {
  for(const item of el.legendContents.querySelectorAll('[data-category]')){
    const [board,level]=item.dataset.category.split('|');
    item.classList.toggle('filtered-out',!app.filters[board]||!app.filters[level]);
  }
}
function applyFilters() {
  app.filtered=filterSchools(app.schools,app.filters,app.q);
  if(app.selected!==null&&!app.filtered.some(s=>s.id===app.selected)) closeSchool();
  el.count.textContent=String(app.filtered.length);
  el.label.textContent=app.filtered.length===app.schools.length?'schools shown':`of ${app.schools.length} schools`;
  el.resultsCount.textContent=String(app.filtered.length);
  el.viewAll.disabled=!app.filtered.length;
  el.reset.hidden=app.q===''&&Object.values(app.filters).every(Boolean);
  for(const chip of document.querySelectorAll('[data-filter]')) chip.setAttribute('aria-pressed',String(app.filters[chip.dataset.filter]));
  updateLegend();renderResults();revealSelectedRow();
  if(app.mapReady) updateMapData();
}
function applySearch() {app.q=normalizeQuery(el.search.value);applyFilters();}
function resetFilters() {clearTimeout(app.searchDebounce);app.filters={...DEFAULT_FILTERS};el.search.value='';el.clear.hidden=true;app.q='';applyFilters();}
function closeSchool(restoreFocus=true) {
  if(restoreFocus && el.card.contains(document.activeElement)){
    const target=selectionOrigin?.isConnected && selectionOrigin.checkVisibility()?selectionOrigin:(mobile.matches?el.toggle:el.search);
    target.focus();
  }
  app.selected=null;el.card.hidden=true;el.copyFeedback.textContent='';updateSelectionRows();
  if(app.mapReady) updateSelectedOverlay();
}
function selectSchool(id,moveCamera=false,origin=document.activeElement) {
  const s=app.byId.get(Number(id));if(!s)return;
  selectionOrigin=origin;app.selected=s.id;el.card.hidden=false;el.copyFeedback.textContent='';
  el.category.replaceChildren(createSwatch(s),document.createTextNode(`${s.board} · ${s.level}`));
  el.detailName.textContent=s.name;el.grades.hidden=!s.grades;el.grades.textContent=s.grades?`Grades ${s.grades}`:'';
  el.address.textContent=s.address;
  const phone=s.phone?.replace(/\D/g,'')||'';el.phoneRow.hidden=!phone;
  if(phone){el.phone.textContent=s.phone;el.phone.href=`tel:+1${phone}`;}
  el.directions.href=directionsUrl(s);
  const web=safeWebsite(s.website);el.website.hidden=!web;
  if(web)el.website.href=web;
  updateSelectionRows();
  revealSelectedRow();
  if(moveCamera)el.detailName.focus({preventScroll:true});
  if(app.mapReady) {
    updateSelectedOverlay();
    if(moveCamera)focusSelectedOnMap();
  }
}
function focusSelectedOnMap() {
  const s=app.byId.get(app.selected);
  if(!app.mapReady || !s)return;
  app.map.flyTo({center:[s.lng,s.lat],zoom:Math.max(app.map.getZoom(),14.7),duration:window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:650,padding:focusPadding()});
}
function focusPadding() {
  const height=el.map.parentElement.clientHeight;
  return mobile.matches || el.map.parentElement.clientWidth<800?{top:20,bottom:Math.min(el.card.offsetHeight+72,height*.55),left:24,right:24}
    :{top:40,bottom:40,left:30,right:el.card.offsetWidth+32};
}
function updateSelectedOverlay() {
  const source=app.map?.getSource('selected-school');if(!source)return;
  const s=app.byId.get(app.selected);
  source.setData(toGeoJSON(s?[s]:[]));
}
function updateMapData() {
  const source=app.map?.getSource('schools');if(source)source.setData(toGeoJSON(app.filtered));
  updateSelectedOverlay();
}
function fitMatchingSchools() {
  if(!app.mapReady||!app.filtered.length)return;
  const m=app.map;const bounds=new app.maplibre.LngLatBounds();
  for(const s of app.filtered)bounds.extend([s.lng,s.lat]);
  m.fitBounds(bounds,{padding:window.innerWidth<=800?{top:35,bottom:42,left:32,right:32}:{top:55,bottom:55,left:55,right:55},maxZoom:15.3,duration:window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:750});
}
function squareImage(color) {
  // 28 logical pixels, two-pixel white outline, crisp one-pixel corners.
  const size=64,canvas=document.createElement('canvas');canvas.width=canvas.height=size;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.beginPath();ctx.roundRect(4,4,56,56,2);ctx.fill();
  ctx.fillStyle=color;ctx.fillRect(8,8,48,48);
  return {width:size,height:size,data:ctx.getImageData(0,0,size,size).data};
}
function addMapLayers() {
  const m=app.map;
  m.addImage('school-blue-square',squareImage('#1875ce'),{pixelRatio:2});
  m.addImage('school-red-square',squareImage('#ae2445'),{pixelRatio:2});
  m.addSource('schools',{type:'geojson',data:toGeoJSON(app.filtered),cluster:true,clusterMaxZoom:14,clusterRadius:51});
  m.addSource('selected-school',{type:'geojson',data:toGeoJSON([])});
  m.addLayer({id:'school-clusters',type:'circle',source:'schools',filter:['has','point_count'],paint:{'circle-color':'#263f51','circle-radius':['step',['get','point_count'],18,10,23,40,28],'circle-stroke-color':'#ffffff','circle-stroke-width':2}});
  m.addLayer({id:'school-cluster-count',type:'symbol',source:'schools',filter:['has','point_count'],layout:{'text-field':['get','point_count_abbreviated'],'text-font':['Noto Sans Regular'],'text-size':12},paint:{'text-color':'#ffffff'}});
  const elementary={type:'circle',filter:['==',['get','level'],'Elementary'],paint:{'circle-radius':markerExpression('radius'),'circle-color':['match',['get','board'],'TDSB','#1875ce','#ae2445'],'circle-stroke-color':'#ffffff','circle-stroke-width':2}};
  const secondary={type:'symbol',filter:['==',['get','level'],'Secondary'],layout:{'icon-image':['match',['get','board'],'TDSB','school-blue-square','school-red-square'],'icon-size':['interpolate',['linear'],['zoom'],...MARKER_STOPS.flatMap(s=>[s.zoom,s.square/28])],'icon-allow-overlap':true,'icon-ignore-placement':true}};
  m.addLayer({...elementary,id:'school-elementary',source:'schools'});
  m.addLayer({...secondary,id:'school-secondary',source:'schools'});
  m.addLayer({id:'school-hit-area',type:'circle',source:'schools',filter:['!', ['has','point_count']],paint:{'circle-radius':22,'circle-opacity':0}});
  m.addLayer({id:'selected-halo',type:'circle',source:'selected-school',paint:{'circle-radius':24,'circle-color':'#14212e','circle-opacity':.12,'circle-stroke-color':'#14212e','circle-stroke-width':2}});
  m.addLayer({...elementary,id:'selected-elementary',source:'selected-school'});
  m.addLayer({...secondary,id:'selected-secondary',source:'selected-school'});
  for(const layer of ['school-clusters','school-hit-area']){
    m.on('mouseenter',layer,()=>m.getCanvas().style.cursor='pointer');
    m.on('mouseleave',layer,()=>m.getCanvas().style.cursor='');
  }
  m.on('click',async e=>{
    const features=m.queryRenderedFeatures(e.point,{layers:['school-hit-area','school-clusters']});
    const f=nearestFeature(features,e.point,coordinates=>m.project(coordinates));
    if(!f)return;
    if(!('cluster_id' in f.properties)){selectSchool(f.properties.id,true,m.getCanvas());return;}
    try{
      const zoom=await m.getSource('schools').getClusterExpansionZoom(f.properties.cluster_id);
      m.easeTo({center:f.geometry.coordinates,zoom,duration:window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:450});
    }catch(err){console.warn('Could not expand this cluster:',err);}
  });
  updateSelectedOverlay();
}
async function initMap() {
  if(app.mapBusy)return;app.mapBusy=true;app.mapFailed=false;
  el.loading.hidden=false;el.fallback.hidden=true;el.map.hidden=false;el.viewAll.hidden=false;el.legend.hidden=false;
  try{
    // No build system or secrets required: this works on GitHub Pages from any repository path.
    const styleLink=$('mapStyles');
    const stylesReady=styleLink.sheet?Promise.resolve():new Promise((resolve,reject)=>{
      const stylesheet=document.createElement('link');
      stylesheet.id='mapStyles';stylesheet.rel='stylesheet';stylesheet.href=styleLink.href;
      stylesheet.onload=resolve;stylesheet.onerror=()=>reject(new Error('Map controls could not load'));
      styleLink.replaceWith(stylesheet);
    });
    const [maplibregl]=await Promise.all([import('https://unpkg.com/maplibre-gl@6.17.0/dist/maplibre-gl.mjs'),stylesReady]);
    app.maplibre=maplibregl;
    if(app.map){app.map.remove();app.map=null;app.mapReady=false;}
    const bounds=new maplibregl.LngLatBounds();
    for(const s of app.filtered)bounds.extend([s.lng,s.lat]);
    const camera=app.filtered.length?{bounds,fitBoundsOptions:{padding:mobile.matches?32:55,maxZoom:15.3}}:{center:[-79.387,43.715],zoom:10.5};
    const map=new maplibregl.Map({container:el.map,style:'https://tiles.openfreemap.org/styles/positron',...camera,attributionControl:true,maxZoom:19,dragRotate:false,touchPitch:false});
    app.map=map;
    app.attributionObserver?.disconnect();
    app.attributionObserver=new ResizeObserver(([entry])=>{
      el.map.parentElement.style.setProperty('--attribution-height',`${Math.ceil(entry.target.getBoundingClientRect().height)}px`);
    });
    app.attributionObserver.observe(el.map.querySelector('.maplibregl-ctrl-attrib'));
    map.addControl(new maplibregl.NavigationControl({showCompass:false,visualizePitch:false}),'top-right');
    map.touchZoomRotate.disableRotation();
    await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error('Map style loading timed out')),16000);
      map.once('load',()=>{clearTimeout(timeout);resolve();});
      // Log recoverable tile/glyph errors; do not discard the map for a single failed tile.
      map.on('error',e=>console.warn('Map resource error:',e.error||e));
    });
    addMapLayers();app.mapReady=true;el.loading.hidden=true;el.fallback.hidden=true;el.viewAll.hidden=false;el.legend.hidden=false;
    focusSelectedOnMap();
  }catch(err){console.warn('Map could not initialize:',err);app.mapReady=false;app.mapFailed=true;
    app.attributionObserver?.disconnect();
    if(app.map){try{app.map.remove();}catch{}app.map=null;}
    el.loading.hidden=true;el.map.hidden=true;el.fallback.hidden=false;el.viewAll.hidden=true;el.legend.hidden=true;
  }finally{app.mapBusy=false;}
}
function bindUI() {
  document.querySelectorAll('[data-filter]').forEach(chip=>chip.addEventListener('click',()=>{
    const key=chip.dataset.filter;app.filters[key]=!app.filters[key];applyFilters();
  }));
  el.search.addEventListener('input',()=>{el.clear.hidden=!el.search.value;clearTimeout(app.searchDebounce);app.searchDebounce=setTimeout(applySearch,115);});
  el.search.addEventListener('keydown',e=>{if(e.key==='Enter'){clearTimeout(app.searchDebounce);applySearch();if(app.filtered.length){setResultsOpen(false,false);selectSchool(app.filtered[0].id,true,el.search);}}});
  el.clear.addEventListener('click',()=>{el.search.value='';el.clear.hidden=true;clearTimeout(app.searchDebounce);applySearch();el.search.focus();});
  el.reset.addEventListener('click',resetFilters);
  el.toggle.addEventListener('click',()=>setResultsOpen(!el.resultsPanel.classList.contains('open')));
  el.closeResults.addEventListener('click',()=>setResultsOpen(false));
  el.more.addEventListener('click',()=>appendNextPage());
  el.closeCard.addEventListener('click',()=>closeSchool());
  $('resultsBackdrop').addEventListener('click',()=>setResultsOpen(false));
  el.viewAll.addEventListener('click',()=>{closeSchool();fitMatchingSchools();});
  el.retry.addEventListener('click',initMap);
  el.legendToggle.addEventListener('click',()=>{
    const open=el.legendContents.hidden;el.legendContents.hidden=!open;el.legendToggle.setAttribute('aria-expanded',String(open));
  });
  el.info.addEventListener('click',()=>el.about.showModal());
  el.closeAbout.addEventListener('click',()=>el.about.close());
  el.copy.addEventListener('click',async()=>{
    const s=app.byId.get(app.selected);if(!s)return;
    const text=`${s.name}, ${s.address}`;
    try{await navigator.clipboard.writeText(text);el.copyFeedback.textContent='Address copied';}
    catch{el.copyFeedback.textContent='Copy unavailable on this device';}
    clearTimeout(app.copyReset);app.copyReset=setTimeout(()=>el.copyFeedback.textContent='',2200);
  });
  document.addEventListener('keydown',e=>{
    if(e.key==='Tab' && mobile.matches && el.resultsPanel.classList.contains('open')){
      const nodes=focusable(el.resultsPanel),first=nodes[0],last=nodes.at(-1);
      if(e.shiftKey && document.activeElement===first){e.preventDefault();last?.focus();}
      else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first?.focus();}
    }
    if(e.key==='Escape'&&!el.about.open){if(el.resultsPanel.classList.contains('open'))setResultsOpen(false);else if(app.selected!==null)closeSchool();}
  });
}
async function start() {
  bindUI();
  // Show the four categories immediately; the key can be collapsed at any size.
  el.legendContents.hidden=false;el.legendToggle.setAttribute('aria-expanded','true');
  try {
    const response=await fetch(new URL('./data/schools.json',import.meta.url));
    if(!response.ok)throw new Error(`School data: ${response.status}`);
    const rows=await response.json();
    if(!Array.isArray(rows)||!rows.length)throw new Error('School dataset is empty');
    app.schools=rows.filter(s=>s&&Number.isFinite(s.lat)&&Number.isFinite(s.lng)&&BOARD_KEYS.includes(s.board)&&LEVEL_KEYS.includes(s.level));
    app.byId=new Map(app.schools.map(s=>[s.id,s]));
    const counts=countSchools(app.schools);
    for(const name of [...BOARD_KEYS,...LEVEL_KEYS]){
      const node=document.querySelector(`[data-count="${name}"]`);if(node)node.textContent=String(counts[name]);
    }
    applyFilters();await initMap();
  }catch(err){console.error('School data failed:',err);el.loading.hidden=true;el.fallback.hidden=false;el.viewAll.hidden=true;el.legend.hidden=true;
    el.fallback.querySelector('h2').textContent='School data could not load';
    el.fallback.querySelector('p').textContent='Please refresh the page or check that data/schools.json was uploaded to your repository.';
    el.retry.hidden=true;
  }
}
start();
