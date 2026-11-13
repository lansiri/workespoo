import json,glob,sys,re
BAN=re.compile(r'\b(strong|excellent|great|impressive|perfect|ideal|expert|talented|skilled|qualified|senior|junior|fit|match(es|ed)?|best|top|highly|score|percent)\b|%|\d+\s*/\s*\d+',re.I)
for f in sorted(glob.glob(sys.argv[1]+'/*.json')):
    r=json.load(open(f))
    rp=r.get('rawParsed') or {}
    ms=(r.get('meta') or {}).get('latencyMs')
    print(f.split('/')[-1], 'valid' if r['firstAttemptValid'] else 'INVALID', ms)
    for x in (rp.get('reasons') or []):
        t=x.get('text','')
        print('  %3d %s,%s%s %s'%(len(t),x.get('signal'),x.get('sentence'),' BANNED' if BAN.search(t) else '',t))
