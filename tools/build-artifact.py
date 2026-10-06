#!/usr/bin/env python3
"""Baut aus index.html, styles.css und app.js eine einzelne HTML-Datei
(dist/sportverein-app.html) zum Testen als claude.ai-Artifact-Link.

Aufruf:  python3 tools/build-artifact.py
"""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent

index = (ROOT / 'index.html').read_text(encoding='utf-8')
css = (ROOT / 'styles.css').read_text(encoding='utf-8')
js = (ROOT / 'app.js').read_text(encoding='utf-8')

# Nur den Inhalt von <body> übernehmen, ohne die Script-Tags (JS wird eingebettet)
body = re.search(r'<body>(.*)</body>', index, re.S).group(1)
body = re.sub(r'\s*<script src="[^"]+"></script>', '', body).strip()

# Im Artifact polstert die umgebende Seite bereits die Ränder für Notch/Statusleiste
overrides = '''
/* ---------- Anpassungen für die Artifact-Ansicht ---------- */
.app-header { top: env(safe-area-inset-top, 0px); padding-top: 0; min-height: var(--header-h); }
'''

# Datei-Download gibt es in der Artifact-Ansicht nicht – den Code dafür weglassen
js = re.sub(r"\n  downloadExport: \(\) => \{.*?\n  \},", '', js, count=1, flags=re.S)

for name, text in (('styles.css', css), ('app.js', js)):
    if '</script' in text or '</style' in text:
        raise SystemExit(f'{name} enthält ein schließendes Tag und kann nicht eingebettet werden')

page = f'''<title>Sportverein-App</title>
<meta name="theme-color" content="#15803d">
<style>
{css}
{overrides}
</style>
{body}
<script>
window.SV_ARTIFACT = true; // Artifact-Ansicht: keine Datei-Downloads möglich
{js}
</script>
'''

out = ROOT / 'dist' / 'sportverein-app.html'
out.parent.mkdir(exist_ok=True)
out.write_text(page, encoding='utf-8')
print(f'{out.relative_to(ROOT)} geschrieben ({len(page.encode()) // 1024} KB)')
