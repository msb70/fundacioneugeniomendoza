"""Captura original (en vivo) vs build local y calcula % de píxeles distintos."""
import asyncio, sys, os
from playwright.async_api import async_playwright
from PIL import Image, ImageChops

OUT = sys.argv[1]
LOCAL = 'http://localhost:8765'
LIVE = 'https://fundacioneugeniomendoza.com'
ROUTES = sys.argv[2].split(',')
VIEWPORTS = {'desktop': (1366, 900), 'mobile': (390, 844)}
os.makedirs(OUT, exist_ok=True)

FREEZE = """
*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}
"""

async def shot(page, url, path):
    await page.goto(url, wait_until='networkidle', timeout=90000)
    await page.add_style_tag(content=FREEZE)
    # desactivar autoplay del carrusel / marquee para comparar el mismo estado
    await page.evaluate("""() => { for (let i = 1; i < 99999; i++) { clearInterval(i); clearTimeout(i); } window.scrollTo(0,0); }""")
    await page.wait_for_timeout(1200)
    await page.screenshot(path=path, full_page=True)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args=['--no-sandbox'])
        for vp, (w, h) in VIEWPORTS.items():
            ctx = await b.new_context(viewport={'width': w, 'height': h}, ignore_https_errors=True)
            page = await ctx.new_page()
            for r in ROUTES:
                name = (r.strip('/').replace('/', '_') or 'home') + '_' + vp
                a, c = f'{OUT}/{name}_orig.png', f'{OUT}/{name}_new.png'
                try:
                    await shot(page, LIVE + r, a)
                    await shot(page, LOCAL + r, c)
                except Exception as e:
                    print(name, 'ERROR', str(e)[:120]); continue
                A, C = Image.open(a).convert('RGB'), Image.open(c).convert('RGB')
                if A.size != C.size:
                    print(f'{name}: tamaño distinto orig={A.size} nuevo={C.size}')
                    hh = min(A.size[1], C.size[1]); A = A.crop((0, 0, A.size[0], hh)); C = C.crop((0, 0, C.size[0], hh))
                diff = ImageChops.difference(A, C).convert('L').point(lambda v: 255 if v > 24 else 0)
                pct = 100 * sum(diff.histogram()[255:]) / (diff.size[0] * diff.size[1])
                print(f'{name}: {pct:.2f}% píxeles distintos')
                if pct > 0.5:
                    diff.save(f'{OUT}/{name}_DIFF.png')
            await ctx.close()
        await b.close()

asyncio.run(main())
