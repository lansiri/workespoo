import json,glob,sys
for f in sorted(glob.glob(sys.argv[1]+'/*.json')):
  if f.endswith('_summary.json'): continue
  r=json.load(open(f)); m=r.get('meta') or {}
  print(f.split('/')[-1], r['ok'], (r.get('error') or '')[:50], {k:m.get(k) for k in ('latencyMs','totalMs','attempts') if k in m})
  for x in (r.get('data') or {}).get('reasons',[]): print('   ',x['signal'],x['sentence'],len(x['text']),x['text'])
