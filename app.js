import { BOARD_KEYS, LEVEL_KEYS, DEFAULT_FILTERS, normalizeQuery, filterSchools, countSchools, toGeoJSON, safeWebsite, directionsUrl } from './utils.mjs';

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
  sourceReady:false, searchDebounce:null, copyReset:null
};
const PAGE_SIZE=100;

function createSwatch(s) {
  const i=document.createElement('i');
  i.className=`result-swatch ${s.board==='TDSB'?'blue':'red'} ${s.level==='Elementary'?'circle':'square'}`;
  i.style.background=s.board==='TDSB'?'#1875ce':'#ae2445';
  i.setAttribute('aria-hidden','true');return i;
}
function setResultsOpen(open) {
  el.resultsPanel.classList.toggle('open',open);
  el.toggle.setAttribute('aria-expanded',String(open));
  if (open) { el.more.hidden=app.rendered>=app.filtered.length; }
}
function updateSelectionRows() {
  for(const row of el.resultsList.querySelectorAll('.school-result')) {
    const active=Number(row.dataset.schoolId)===app.selected;
    row.classList.toggle('active',active);
    if(active) row.setAttribute('aria-current','true'); else row.removeAttribute('aria-current');
  }
}
function appendNextPage() {
  const end=Math.min(app.rendered+PAGE_SIZE,app.filtered.length);
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
    row.addEventListener('click',()=>{selectSchool(s.id,true);setResultsOpen(false);});
    frag.append(row);
  }
  el.resultsList.append(frag);
  app.rendered=end;
  el.resultsMeta.textContent=`Showing ${app.rendered} of ${app.filtered.length}`;
  el.more.hidden=app.rendered>=app.filtered.length;
  updateSelectionRows();
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
  el.reset.hidden=app.q===''&&Object.values(app.filters).every(Boolean);
  for(const chip of document.querySelectorAll('[data-filter]')) chip.setAttribute('aria-pressed',String(app.filters[chip.dataset.filter]));
  updateLegend();renderResults();
  if(app.mapReady) updateMapData();
}
function applySearch() {app.q=normalizeQuery(el.search.value);applyFilters();}
function resetFilters() {app.filters={...DEFAULT_FILTERS};el.search.value='';el.clear.hidden=true;app.q='';applyFilters();}
function closeSchool() {
  app.selected=null;el.card.hidden=true;el.copyFeedback.textContent='';updateSelectionRows();
  if(app.mapReady) updateSelectedOverlay();
}
function selectSchool(id,moveCamera=false) {
  const s=app.byId.get(Number(id));if(!s)return;
  app.selected=s.id;el.card.hidden=false;el.copyFeedback.textContent='';
  el.category.replaceChildren(createSwatch(s),document.createTextNode(`${s.board} · ${s.level}`));
  el.detailName.textContent=s.name;el.grades.textContent=`Grades ${s.grades}`;
  el.address.textContent=s.address;
  const phone=s.phone?.replace(/\D/g,'')||'';el.phoneRow.hidden=!phone;
  if(phone){el.phone.textContent=s.phone;el.phone.href=`tel:+1${phone}`;}
  el.directions.href=directionsUrl(s);
  const web=safeWebsite(s.website);el.website.hidden=!web;
  if(web)el.website.href=web;
  updateSelectionRows();
  if(app.mapReady) {
    updateSelectedOverlay();
    if(moveCamera){app.map.flyTo({center:[s.lng,s.lat],zoom:Math.max(app.map.getZoom(),14.7),duration:window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:650,padding:focusPadding()});}
  }
}
function focusPadding() {return window.innerWidth<=800?{top:50,bottom:Math.min(window.innerHeight*.33,250),left:25,right:25}:{top:50,bottom:60,left:30,right:Math.min(340,window.innerWidth*.3)};}
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
  const size=42,canvas=document.createElement('canvas');canvas.width=canvas.height=size;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';roundRect(ctx,4,4,34,34,8);ctx.fill();
  ctx.fillStyle=color;roundRect(ctx,8,8,26,26,5);ctx.fill();
  return {width:size,height:size,data:ctx.getImageData(0,0,size,size).data};
}
function roundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();}
function addMapLayers() {
  const m=app.map;
  m.addImage('school-blue-square',squareImage('#1875ce'),{pixelRatio:2});
  m.addImage('school-red-square',squareImage('#ae2445'),{pixelRatio:2});
  m.addSource('schools',{type:'geojson',data:toGeoJSON(app.filtered),cluster:true,clusterMaxZoom:14,clusterRadius:51});
  m.addSource('selected-school',{type:'geojson',data:toGeoJSON([])});
  m.addLayer({id:'school-clusters',type:'circle',source:'schools',filter:['has','point_count'],paint:{'circle-color':'#263f51','circle-opacity':.94,'circle-radius':['step',['get','point_count'],18,10,23,40,28],'circle-stroke-color':'#ffffff','circle-stroke-width':2.5}});
  m.addLayer({id:'school-cluster-count',type:'symbol',source:'schools',filter:['has','point_count'],layout:{'text-field':['get','point_count_abbreviated'],'text-font':['Noto Sans Regular'],'text-size':12},paint:{'text-color':'#ffffff'}});
  m.addLayer({id:'school-elementary',type:'circle',source:'schools',filter:['all',['!', ['has','point_count']],['==',['get','level'],'Elementary']],paint:{'circle-radius':['interpolate',['linear'],['zoom'],10,5,13,7,16,9],'circle-color':['match',['get','board'],'TDSB','#1875ce','#ae2445'],'circle-stroke-color':'#ffffff','circle-stroke-width':2.3,'circle-opacity':.96}});
  m.addLayer({id:'school-secondary',type:'symbol',source:'schools',filter:['all',['!', ['has','point_count']],['==',['get','level'],'Secondary']],layout:{'icon-image':['match',['get','board'],'TDSB','school-blue-square','school-red-square'],'icon-size':['interpolate',['linear'],['zoom'],10,.58,13,.82,16,1.05],'icon-allow-overlap':true,'icon-ignore-placement':true}});
  m.addLayer({id:'selected-halo',type:'circle',source:'selected-school',paint:{'circle-radius':20,'circle-color':'rgba(255,255,255,0)','circle-stroke-color':'#112b38','circle-stroke-width':4}});
  for(const layer of ['school-clusters','school-elementary','school-secondary']){
    m.on('mouseenter',layer,()=>m.getCanvas().style.cursor='pointer');
    m.on('mouseleave',layer,()=>m.getCanvas().style.cursor='');
  }
  m.on('click','school-clusters',async e=>{
    const f=e.features?.[0];if(!f)return;
    try{const zoom=await m.getSource('schools').getClusterExpansionZoom(f.properties.cluster_id);
      m.easeTo({center:f.geometry.coordinates,zoom,duration:window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:450});}
    catch(err){console.warn('Could not expand this cluster:',err);}
  });
  for(const layer of ['school-elementary','school-secondary']) {
    m.on('click',layer,e=>{const f=e.features?.[0];if(f)selectSchool(f.properties.id,false);});
  }
  updateSelectedOverlay();
}
async function initMap() {
  if(app.mapBusy)return;app.mapBusy=true;app.mapFailed=false;
  el.loading.hidden=false;el.fallback.hidden=true;el.map.hidden=false;el.viewAll.hidden=false;el.legend.hidden=false;
  try{
    // No build system or secrets required: this works on GitHub Pages from any repository path.
    const maplibregl=await import('https://unpkg.com/maplibre-gl@6.17.0/dist/maplibre-gl.mjs');
    app.maplibre=maplibregl;
    if(app.map){app.map.remove();app.map=null;app.mapReady=false;}
    const map=new maplibregl.Map({container:el.map,style:'https://tiles.openfreemap.org/styles/liberty',center:[-79.387,43.715],zoom:10.5,attributionControl:true,maxZoom:19,dragRotate:false,touchPitch:false});
    app.map=map;
    map.addControl(new maplibregl.NavigationControl({showCompass:false,visualizePitch:false}),'top-right');
    map.touchZoomRotate.disableRotation();
    await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error('Map style loading timed out')),16000);
      map.once('load',()=>{clearTimeout(timeout);resolve();});
      // Log recoverable tile/glyph errors; do not discard the map for a single failed tile.
      map.on('error',e=>console.warn('Map resource error:',e.error||e));
    });
    addMapLayers();app.mapReady=true;el.loading.hidden=true;el.fallback.hidden=true;el.viewAll.hidden=false;el.legend.hidden=false;
    fitMatchingSchools();
  }catch(err){console.warn('Map could not initialize:',err);app.mapReady=false;app.mapFailed=true;
    if(app.map){try{app.map.remove();}catch{}app.map=null;}
    el.loading.hidden=true;el.map.hidden=true;el.fallback.hidden=false;el.viewAll.hidden=true;el.legend.hidden=true;
  }finally{app.mapBusy=false;}
}
function bindUI() {
  document.querySelectorAll('[data-filter]').forEach(chip=>chip.addEventListener('click',()=>{
    const key=chip.dataset.filter;app.filters[key]=!app.filters[key];applyFilters();
  }));
  el.search.addEventListener('input',()=>{el.clear.hidden=!el.search.value;clearTimeout(app.searchDebounce);app.searchDebounce=setTimeout(applySearch,115);});
  el.search.addEventListener('keydown',e=>{if(e.key==='Enter'){clearTimeout(app.searchDebounce);applySearch();if(app.filtered.length){selectSchool(app.filtered[0].id,true);setResultsOpen(false);el.search.blur();}}});
  el.clear.addEventListener('click',()=>{el.search.value='';el.clear.hidden=true;clearTimeout(app.searchDebounce);applySearch();el.search.focus();});
  el.reset.addEventListener('click',resetFilters);
  el.toggle.addEventListener('click',()=>setResultsOpen(!el.resultsPanel.classList.contains('open')));
  el.closeResults.addEventListener('click',()=>setResultsOpen(false));
  el.more.addEventListener('click',appendNextPage);
  el.closeCard.addEventListener('click',closeSchool);
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
    if(e.key==='Escape'&&!el.about.open){if(el.resultsPanel.classList.contains('open'))setResultsOpen(false);else if(app.selected!==null)closeSchool();}
  });
}
async function start() {
  bindUI();
  // Four-category legend is visible by default on desktop and compact on mobile.
  const showLegend=window.innerWidth>800;el.legendContents.hidden=!showLegend;el.legendToggle.setAttribute('aria-expanded',String(showLegend));
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
