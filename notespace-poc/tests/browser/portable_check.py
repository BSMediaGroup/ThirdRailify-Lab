"""Offline fixture-backed UI test. Not a native persistence or live-provider test."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
import json
root=Path(__file__).resolve().parents[2]; out=root/'.test-artifacts';out.mkdir(exist_ok=True)
s=root.joinpath('OPEN-NOTESPACE.html').read_text().replace('<head>','<head><script>'+Path(__file__).with_name('render_fixture.js').read_text()+'</script>')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('NOTESPACE_BROWSER','/usr/bin/chromium'),headless=True,args=['--no-sandbox']);page=b.new_page(viewport={'width':1600,'height':1000},reduced_motion='reduce');page.set_default_timeout(5000);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content(s,wait_until='domcontentloaded');print('PARSE ERRORS',errors,flush=True);page.wait_for_function('window.NotespacePOC?.getBoard()?.objects.length===12',timeout=5000);page.wait_for_timeout(300);page.evaluate("document.querySelectorAll('.toast').forEach(n=>n.remove())")
 page.screenshot(path=str(out/'package-preview.png'))
 assert not errors,errors
 page.locator('[data-id=idea-one]').dblclick(position={'x':40,'y':40});assert page.locator('#edit-title').is_visible();page.locator('.modal-header [data-action=close-modal]').click()
 page.locator('[data-action=cinema]').click();page.evaluate('NotespacePOC.fitBoard()');page.evaluate("document.querySelectorAll('.toast').forEach(n=>n.remove())");page.screenshot(path=str(out/'package-cinema.png'))
 page.locator('.board-actions [data-action=inspector]').click();assert page.locator('#inspector').is_visible();page.locator('#inspector [data-action=inspector]').click();page.keyboard.press('Escape')
 page.locator('.main-rail [data-action=tasks]').click();page.wait_for_function("document.querySelectorAll('.todo-task').length === 4");page.screenshot(path=str(out/'package-tasks.png'));page.locator('.main-rail [data-action=library]').click();page.wait_for_function("document.querySelectorAll('.board-card').length === 2");page.screenshot(path=str(out/'package-library.png'))
 assert not errors,errors
 out.joinpath('portable-check.json').write_text(json.dumps({'packageHTMLLoaded':True,'objects':12,'doubleClickEditor':True,'cinemaInspector':True,'pageErrors':errors,'nativeStorage':'not exercised; offline memory fixture used under managed navigation policy'},indent=2))
 b.close()
 print('Packaged single HTML: render, double-click edit, cinema and inspector passed. No page errors.')
