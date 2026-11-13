# Mechanical judge for render-B1c: performance claims and job-title phrases (target item i=0).
import json, sys, glob, os, re
PERF=re.compile(r'accident|safely|without (any )?(incident|error|mistake)|never had|always on time', re.I)
for d in sys.argv[1:]:
    for f in sorted(glob.glob(d+'/*.json')):
        if os.path.basename(f).startswith('_'): continue
        r=json.load(open(f))
        if not r['ok']: print('CALLERR', f, r.get('error','')[:80]); continue
        t=json.loads(r['text']); it=t['items'][0]
        perf=bool(PERF.search(it['text']+' '+t['summary']))
        title=not any(w.lower().endswith('ing') for w in it['phrase'].split())
        lat=r['meta']['latencyMs'] if r.get('meta') else None
        print(f"{os.path.basename(f):28} perf={int(perf)} title={int(title)} lat={lat} | {it['phrase']} | {it['text']} | {t['summary']}")
