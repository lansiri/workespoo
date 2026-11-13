import json,glob,re,sys
# Proposed guard: hold text until the first '?'; if 40 words pass with no '?', discard all -> fallback.
def proposed(t):
    t=t.strip()
    if t.startswith('[[STOP]]'): return ('stop','')
    i=t.find('?')
    pre=t[:i+1] if i>=0 else t
    if i<0 or len(pre.split())>40: return ('fallback','')
    return ('emit',pre)
leakre=re.compile(r'^(I need|I should|We need|Should|Let me|Let\'s|I must|Need to)',re.I)
files=sorted(glob.glob('results*/*.json')+glob.glob('verify-interviewer-live-F1/results-*/*.json'))
leaks=0;leakEmit=0;validChanged=0;valid=0
for f in files:
    if f.endswith('_summary.json'): continue
    r=json.load(open(f)); t=(r.get('text') or '').strip()
    if not t: continue
    k,e=proposed(t)
    if leakre.match(t):
        leaks+=1
        if k=='emit': leakEmit+=1; print('LEAK EMITTED',f,repr(e[:200]))
    else:
        valid+=1
        if k=='emit' and e!=t: validChanged+=1; print('VALID TRUNCATED',f,repr(t[:200]))
        if k=='fallback' and '[[STOP]]' not in t: validChanged+=1; print('VALID->FALLBACK',f,repr(t[:200]))
print(f'outputs={leaks+valid} leaks={leaks} leaks_emitted_by_proposed_guard={leakEmit} non-leak_changed={validChanged}/{valid}')
