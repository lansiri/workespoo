# Builds case files for verifying finding render-B1c. Run from repo root.
import json, re
D='evals/prompt-lab/card-render-esco/'
O=D+'verify-render-B1c/'
spec=open('docs/specs/prompts/card-synthesis.md').read()
specB=spec.split('## B. Rendering')[1].split('```')[1].strip('\n')
a=json.load(open(D+'cases.json')); b=json.load(open(D+'cases-extra.json'))
allc={c['id']:c for c in a['cases']+b['cases']}
sysB=allc['b-en-03']['messages'][0]['content']
print('system matches spec:', sysB.strip()==specB.strip())
hdr={k:v for k,v in a.items() if k!='cases'}
R4o='R4. No praise, levels, years, durations, or comparisons.'
R4n='R4. No praise, levels, years, durations, or comparisons, and no claims about how well they did it (such as "without accidents" or "always on time").'
PHo='If it is already English, return it unchanged except for removing quality words.'
PHn=PHo+' Skills read as activities ("Driving forklifts"), not job titles.'
assert sysB.count(R4o)==1 and sysB.count(PHo)==1
def mk(name, ids, system, prefix):
    cs=[]
    for i in ids:
        c=json.loads(json.dumps(allc[i])); c['messages'][0]['content']=system; c['id']=prefix+i; cs.append(c)
    json.dump({**hdr,'item':'card-render-'+name,'cases':cs},open(O+f'cases-{name}.json','w'),ensure_ascii=False,indent=1)
T=['b-en-03','b-fi-10','b-sv-11']; REG=['b-sv-07','b-en-08','b-fi-01']
mk('orig',T,sysB,'')
mk('fixR4',T+REG,sysB.replace(R4o,R4n),'fix-R4-')
mk('fixR4act',T+REG,sysB.replace(R4o,R4n).replace(PHo,PHn),'fix-R4act-')
