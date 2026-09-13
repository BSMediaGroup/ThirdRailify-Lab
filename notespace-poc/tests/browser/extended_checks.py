"""Offline fixture-backed UI test. Not a native persistence or live-provider test."""
import os
from playwright.sync_api import sync_playwright
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[2];R=ROOT/'public';OUT=ROOT/'.test-artifacts';OUT.mkdir(exist_ok=True)
base=R.joinpath('index.html').read_text().replace('<link rel="stylesheet" href="/styles.css">','<style>'+R.joinpath('styles.css').read_text()+'</style>')
base=base.replace('<script src="/model.js"></script>','<script>'+Path(__file__).with_name('render_fixture.js').read_text()+'</script><script>'+R.joinpath('model.js').read_text()+'</script>').replace('<script src="/seed.js"></script>','<script>'+R.joinpath('seed.js').read_text()+'</script>').replace('<script src="/app.js"></script>','<script>'+R.joinpath('app.js').read_text()+'</script>')
checks=[]
def ck(n,b=True):
 assert b,n
 checks.append(n);print('PASS',n,flush=True)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('NOTESPACE_BROWSER','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1440,'height':1000},reduced_motion='reduce');page.set_default_timeout(5000);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content(base,wait_until='domcontentloaded');page.wait_for_function('window.NotespacePOC?.getBoard()?.objects.length===12');page.wait_for_timeout(200)
 # Selection and grouping use real application actions. No external provider calls.
 page.evaluate("NotespacePOC.select('idea-one');NotespacePOC.select('idea-two',true)")
 page.locator('#selection-toolbar [data-action=group]').click();page.evaluate('NotespacePOC.flush()')
 ck('Group selection creates a real nested parent',page.evaluate("(()=>{let b=NotespacePOC.getBoard();let a=b.objects.find(n=>n.id==='idea-one'),c=b.objects.find(n=>n.id==='idea-two');return a.parentId===c.parentId&&a.parentId!=='frame-ideas';})()"))
 page.locator('#selection-toolbar [data-action=ungroup]').click();page.evaluate('NotespacePOC.flush()')
 ck('Ungroup preserves both objects',page.evaluate("NotespacePOC.getBoard().objects.length===12"))
 page.evaluate('NotespacePOC.fitBoard()')
 page.locator('[data-tool=connector]').click()
 a=page.locator('[data-id=idea-one]').bounding_box();b=page.locator('[data-id=idea-two]').bounding_box()
 page.mouse.click(a['x']+30,a['y']+35);page.mouse.click(b['x']+30,b['y']+35);page.evaluate('NotespacePOC.flush()')
 ck('Attached connector creates canonical object endpoints',page.evaluate("(()=>{let e=NotespacePOC.getBoard().edges.at(-1);return e.from.nodeId==='idea-one'&&e.to.nodeId==='idea-two';})()"))
 # Free leader in blank space, disjoint from the toolbar.
 v=page.locator('#viewport').bounding_box()
 page.locator('[data-tool=connector]').click();page.mouse.click(v['x']+20,v['y']+160);page.mouse.click(v['x']+23,v['y']+215);page.evaluate('NotespacePOC.flush()')
 ck('Free leader retains free coordinates',page.evaluate("(()=>{let e=NotespacePOC.getBoard().edges.at(-1);return Number.isFinite(e.from.x)&&Number.isFinite(e.to.x);})()"))
 page.locator('[data-tool=draw]').click();page.mouse.move(v['x']+35,v['y']+230);page.mouse.down();page.mouse.move(v['x']+85,v['y']+255,steps=6);page.mouse.move(v['x']+115,v['y']+220,steps=5);page.mouse.up();page.evaluate('NotespacePOC.flush()')
 ck('Freehand gesture persists a vector stroke',page.evaluate("NotespacePOC.getBoard().objects.some(n=>n.type==='drawing'&&n.points.length>4)"))
 page.locator('[data-tool=select]').click()
 page.evaluate("NotespacePOC.select('idea-one')")
 handle=page.locator('[data-id=idea-one] [data-resize]').bounding_box();before=page.evaluate("NotespacePOC.getBoard().objects.find(n=>n.id==='idea-one').w")
 page.mouse.move(handle['x']+3,handle['y']+3);page.mouse.down();page.mouse.move(handle['x']+30,handle['y']+25,steps=5);page.mouse.up();page.evaluate('NotespacePOC.flush()')
 ck('Drag-resize updates dimensions',page.evaluate("NotespacePOC.getBoard().objects.find(n=>n.id==='idea-one').w")>before)
 page.locator('#selection-toolbar [data-action=lock-selected]').click();page.evaluate('NotespacePOC.flush()')
 ck('Lock is persisted',page.evaluate("NotespacePOC.getBoard().objects.find(n=>n.id==='idea-one').locked"))
 page.locator('#selection-toolbar [data-action=lock-selected]').click();page.evaluate('NotespacePOC.flush()')
 # Exercise the real exporter while capturing the downloadable blob instead of invoking a managed-browser download.
 page.evaluate("""()=>{window.__exports=[];const click=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download){fetch(this.href).then(r=>r.blob()).then(async b=>window.__exports.push({name:this.download,text:await b.text(),size:b.size,type:b.type}));return;}return click.call(this);};}""")
 page.locator('.main-rail [data-action=export]').click();page.locator('[data-action=export-json]').click();page.wait_for_function('window.__exports.length===1')
 payload=json.loads(page.evaluate('window.__exports[0].text'))
 ck('Editable export includes media and structure',len(payload['assets'])==2 and len(payload['board']['objects'])==13)
 ck('Animated GIF bytes are exported, not a flattened still',any(a['mime']=='image/gif' and a['data'].startswith('data:image/gif;base64,') for a in payload['assets']))
 ck('Export does not include provider client keys','api_key' not in json.dumps(payload) and 'sessionStorage' not in json.dumps(payload))
 old=payload['board']['id']
 page.locator('#import-file').set_input_files({'name':'roundtrip.notespace.json','mimeType':'application/json','buffer':json.dumps(payload).encode()})
 page.wait_for_function('NotespacePOC.getBoard().title.endsWith("· imported")');page.evaluate('NotespacePOC.flush()')
 ck('Round-trip import uses a new seven-character code',page.evaluate('NotespacePOC.getBoard().id')!=old and len(page.evaluate('NotespacePOC.getBoard().id'))==7)
 ck('Round-trip preserves nodes, fields and connections',page.evaluate('NotespacePOC.getBoard().objects.length')==len(payload['board']['objects']) and page.evaluate('NotespacePOC.getBoard().edges.length')==len(payload['board']['edges']))
 ck('Round-trip media is decoded',page.locator('[data-id=spark-sticker] img').evaluate('i=>i.naturalWidth===240'))
 page.locator('.main-rail [data-action=appearance]').click();page.locator('[data-action=choose-bg-mode][data-mode=image]').click();page.locator('#background-file').set_input_files(str(R/'media/spark.gif'));page.wait_for_function('!!NotespacePOC.state.modal.bgImageId');page.locator('[data-action=save-appearance]').click();page.evaluate('NotespacePOC.flush()')
 ck('Custom background image stores a local asset reference',page.evaluate('!!NotespacePOC.getBoard().background.imageId'))
 # Fullscreen API / navigation are deliberately not attempted under this browser policy.
 page.screenshot(path=str(OUT/'roundtrip-1440.png'));ck('No application exceptions',not errors)
 browser.close()
OUT.joinpath('extended-checks.json').write_text(json.dumps({'mode':'Offline DOM interaction with in-memory IndexedDB API fixture; native download captured as blob. No policy modified.','checks':checks,'pageErrors':errors},indent=2))
print('TOTAL',len(checks))
