"""Optional real-map regression checks. Requires Python Playwright and a running Chromium CDP endpoint.
Run the static server, then: python3 tests/browser_smoke.py --evidence /tmp/atlas-evidence
No browser package or test hook is shipped to the website.
"""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--base-url', default='http://127.0.0.1:8000')
parser.add_argument('--cdp', default='http://127.0.0.1:9222')
parser.add_argument('--evidence', default='/tmp/atlas-evidence')
parser.add_argument('--widths', nargs='+', type=int, default=[320,375,390,768,1440])
args = parser.parse_args()
evidence = Path(args.evidence)
evidence.mkdir(parents=True, exist_ok=True)

def instrument(route):
    response = route.fetch()
    # Only the test response exposes state; the served source stays unchanged.
    body = response.text().replace('start();', 'globalThis.__atlas=app;start();').replace('const [maplibregl]=await Promise.all', 'await globalThis.__mapGate; const [maplibregl]=await Promise.all')
    route.fulfill(response=response, body=body)

def ready(page):
    page.goto(args.base_url, wait_until='domcontentloaded')
    page.wait_for_function('globalThis.__atlas?.mapReady', timeout=45000)
    page.wait_for_function('__atlas.map.loaded()', timeout=45000)
    page.evaluate('__atlas.map.stop()')

def count(page, expected):
    page.wait_for_function('(n)=>document.querySelector("#matchCount").textContent===String(n)', arg=expected)

with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp(args.cdp)
    for width in args.widths:
        context = browser.new_context(viewport={'width':width,'height':1000 if width==1440 else 844}, reduced_motion='reduce')
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.route('**/app.js', instrument)
        ready(page)
        count(page,758)
        page.screenshot(path=str(evidence/f'after-live-{width}.png'))
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        assert page.evaluate('''()=>{const a=document.querySelector('.maplibregl-ctrl-attrib').getBoundingClientRect(),l=document.querySelector('#legend').getBoundingClientRect();return l.bottom<=a.top || l.right<=a.left}''')
        # Clear search, Enter selection and clipboard on the real UI.
        context.grant_permissions(['clipboard-read','clipboard-write'])
        page.locator('#search').fill('royal york')
        page.locator('#search').press('Enter')
        assert page.locator('#schoolCard').is_visible()
        page.locator('#copyBtn').click()
        page.wait_for_function("document.querySelector('#copyFeedback').textContent==='Address copied'")
        assert page.evaluate('navigator.clipboard.readText()')
        page.locator('#closeCard').click()
        page.locator('#clearSearch').click();count(page,758)
        page.evaluate('globalThis.initialMap=__atlas.map')
        # All four categories, each board and level, combined filters.
        for board, level, expected in [('TDSB','Elementary',460),('TDSB','Secondary',99),('TCDSB','Elementary',166),('TCDSB','Secondary',33)]:
            page.locator('[data-filter="'+('TCDSB' if board=='TDSB' else 'TDSB')+'"]').click()
            page.locator('[data-filter="'+('Secondary' if level=='Elementary' else 'Elementary')+'"]').click()
            count(page,expected)
            page.locator('#resetBtn').click()
        for key, expected in [('TDSB',199),('TCDSB',559),('Elementary',132),('Secondary',626)]:
            page.locator('[data-filter="'+key+'"]').click();count(page,expected);page.locator('#resetBtn').click()
        page.locator('#search').fill('royal york')
        page.wait_for_function('Number(document.querySelector("#matchCount").textContent)>0 && Number(document.querySelector("#matchCount").textContent)<758')
        page.locator('[data-filter="TCDSB"]').click()
        assert page.evaluate('__atlas.filtered.every(s=>s.board==="TDSB" && `${s.name} ${s.address}`.toLowerCase().includes("royal york"))')
        page.locator('#search').fill('zzzz-no-school-zzzz');count(page,0)
        assert page.locator('#viewAllBtn').is_disabled()
        page.locator('#resetBtn').click();count(page,758)
        if width<=800:
            page.locator('#resultsToggle').click()
            assert page.locator('#resultsPanel').get_attribute('aria-modal')=='true'
            assert page.locator('#closeResults').evaluate('(n)=>document.activeElement===n')
            # Reverse Tab wraps into the same sheet.
            page.keyboard.press('Shift+Tab')
            assert page.locator('#moreResults').evaluate('(n)=>document.activeElement===n')
            page.keyboard.press('Escape')
            assert page.locator('#resultsToggle').evaluate('(n)=>document.activeElement===n')
            page.locator('#resultsToggle').click()
            page.screenshot(path=str(evidence/f'after-sheet-{width}.png'))
        assert page.locator('.school-result').count()==100
        page.locator('#moreResults').click();assert page.locator('.school-result').count()==200
        page.locator('.school-result').first.click()
        assert page.locator('#schoolCard').is_visible()
        assert page.locator('#detailName').evaluate('(n)=>document.activeElement===n')
        assert page.locator('#directionsBtn').get_attribute('href').startswith('https://www.google.com/maps/dir/')
        assert page.locator('#detailAddress').inner_text()
        assert page.evaluate('''()=>{const s=__atlas.byId.get(__atlas.selected),p=__atlas.map.project([s.lng,s.lat]),r=__atlas.map.getCanvas().getBoundingClientRect(),c=document.querySelector('#schoolCard').getBoundingClientRect();return p.y+r.y<c.top || p.x+r.x<c.left}''')
        assert not page.locator('#resultsPanel').get_attribute('aria-modal')
        assert page.locator('.map-panel').evaluate('(n)=>!n.inert')
        if width<=800: assert not page.locator('#resultsPanel').evaluate('(n)=>n.classList.contains("open")')
        page.screenshot(path=str(evidence/f'after-details-{width}.png'))
        page.locator('#closeCard').click()
        assert page.locator('#resultsToggle' if width<=800 else '.school-result').first.evaluate('(n)=>document.activeElement===n')
        assert page.evaluate('__atlas.map===initialMap')
        # Real GeoJSON cluster expansion, using its actual rendered hit target.
        page.locator('#viewAllBtn').click()
        page.wait_for_function('__atlas.map.loaded()')
        page.wait_for_function('''()=>{const m=__atlas.map;return m.queryRenderedFeatures({layers:['school-clusters']}).some(f=>{const p=m.project(f.geometry.coordinates);return p.x>80 && p.x<m.getCanvas().clientWidth-80 && p.y>80 && p.y<m.getCanvas().clientHeight-200})}''')
        cluster = page.evaluate('''()=>{
          const m=__atlas.map;
          const f=m.queryRenderedFeatures({layers:['school-clusters']}).find(f=>{const p=m.project(f.geometry.coordinates);return p.x>80 && p.x<m.getCanvas().clientWidth-80 && p.y>80 && p.y<m.getCanvas().clientHeight-200});
          if(!f)return null;const pt=m.project(f.geometry.coordinates),rect=m.getCanvas().getBoundingClientRect();
          return {x:pt.x+rect.x,y:pt.y+rect.y,zoom:m.getZoom()};
        }''')
        assert cluster, 'Expected a visible cluster'
        page.mouse.click(cluster['x'],cluster['y'])
        page.wait_for_function('(z)=>__atlas.map.getZoom()>z',arg=cluster['zoom'])
        # Same camera for visual comparison of shapes at street scale.
        page.evaluate('__atlas.map.jumpTo({center:[-79.387,43.666],zoom:13.5,padding:{top:0,bottom:0,left:0,right:0}})')
        page.wait_for_function('__atlas.map.loaded()')
        page.screenshot(path=str(evidence/f'after-markers-{width}.png'))
        # Real map hit selection, all four categories; move only the camera for visibility.
        for board,level in [('TDSB','Elementary'),('TDSB','Secondary'),('TCDSB','Elementary'),('TCDSB','Secondary')]:
            target=page.evaluate('''([b,l])=>{
              const s=__atlas.schools.find(s=>s.board===b&&s.level===l);
              __atlas.map.jumpTo({center:[s.lng,s.lat],zoom:16,padding:{top:0,bottom:0,left:0,right:0}});
              return {id:s.id,name:s.name};
            }''',[board,level])
            page.wait_for_function('__atlas.map.loaded()')
            pt=page.evaluate('(id)=>{const s=__atlas.byId.get(id),m=__atlas.map,p=m.project([s.lng,s.lat]),r=m.getCanvas().getBoundingClientRect();return {x:r.x+p.x,y:r.y+p.y}}',target['id'])
            page.mouse.click(pt['x'],pt['y'])
            page.wait_for_function('(id)=>__atlas.selected===id',arg=target['id'])
            assert page.locator('#detailName').inner_text()==target['name']
            if width>800:
                assert page.locator('.school-result.active').get_attribute('aria-current')=='true'
                assert page.locator('.school-result.active').evaluate('(n)=>{const r=n.getBoundingClientRect(),p=n.parentElement.getBoundingClientRect();return r.top>=p.top-1 && r.bottom<=p.bottom+1}')
            assert page.evaluate('async()=>{const data=await __atlas.map.getSource("selected-school").getData();return data.features[0].id}')==target['id']
            page.locator('#closeCard').click()
        assert not errors,errors
        print(f'PASS {width}px: real tiles, categories, filters, search, selection, clusters, sheet/focus, no overflow or uncaught errors',flush=True)
        context.close()
    # Fail each external prerequisite, then restore it and retry the real map.
    for failed_url in ('https://unpkg.com/**/*.mjs','https://unpkg.com/**/*.css','https://tiles.openfreemap.org/styles/positron'):
        context=browser.new_context(viewport={'width':390,'height':844})
        page=context.new_page();page.route('**/app.js',instrument)
        page.route(failed_url, lambda r:r.abort())
        page.goto(args.base_url);page.wait_for_function('!document.querySelector("#mapFallback").hidden',timeout=30000)
        count(page,758);page.locator('#search').fill('royal york')
        page.wait_for_function('__atlas.filtered.length>0 && __atlas.filtered.length<758')
        page.screenshot(path=str(evidence/'after-fallback-390.png'))
        page.unroute(failed_url)
        page.locator('#retryMap').click();page.wait_for_function('__atlas.mapReady',timeout=45000)
        assert not page.locator('#mapFallback').is_visible()
        print(f'PASS: {failed_url} failure preserves directory; Retry recovers the real map',flush=True)
        context.close()
    # Hold map initialization while the directory stays interactive.
    context=browser.new_context(viewport={'width':390,'height':844},reduced_motion='reduce')
    page=context.new_page();page.route('**/app.js',instrument)
    page.add_init_script('globalThis.__mapGate=new Promise(resolve=>globalThis.__releaseMap=resolve)')
    page.goto(args.base_url,wait_until='domcontentloaded');count(page,758)
    page.locator('#search').fill('royal york');page.locator('#search').press('Enter')
    selected=page.evaluate('__atlas.selected')
    assert selected is not None and not page.evaluate('__atlas.mapReady')
    page.evaluate('__releaseMap()')
    page.wait_for_function('__atlas.mapReady && __atlas.map.getZoom()>=14.7',timeout=45000)
    assert page.evaluate('__atlas.selected')==selected
    assert page.locator('#detailName').is_visible()
    print('PASS: selecting while the map loads focuses the correct school once ready',flush=True)
    context.close()
