"""Read the recent CDN checks and compare gallery preview and fallback delivery."""
import concurrent.futures
import datetime as dt
import http.client
import json
import re
import subprocess
import sys
import time
from urllib.parse import parse_qs, urlsplit

sys.path.insert(0,'/opt/yachiyo-status-observer')
import observer as o

lines=subprocess.check_output(['journalctl','-u','yachiyo-status-observer.service','--since','90 minutes ago','--no-pager','-o','short-iso'],text=True).splitlines()
for line in lines:
    stamp=line.split()[0]
    m=re.search(r'cdn samples: ([\w,>_]+)$',line)
    if m: print('CDN_LOG',stamp,m[1])

def probe(item):
    obj=item.get('id','')[:8]
    if not re.fullmatch(r'[a-f0-9]{8}',obj):obj='gallery'
    headers={'Referer':o.SITE+'/gallery','Accept':'image/avif,image/webp,image/*,*/*;q=0.8'}
    for path in ['preview_url','access_url']:
        start=time.monotonic()
        loc=item.get(path)
        try:
            if not isinstance(loc,str):continue
            if re.fullmatch(r'/api/assets/proxy/[a-zA-Z0-9-]+',loc):
                status,r,_=o.fetch(o.SITE+loc,headers,maxbytes=512,timeout=15,prefix=True)
                if status not in (301,302,303,307,308):
                    print('CDN_PROBE',obj,path,'proxy',status);continue
                loc=r.get('Location','')
            url=urlsplit(loc)
            if (url.scheme,url.netloc)!=('https','oss.yachiyo.hk'):continue
            status,h,b=o.fetch(loc,headers,maxbytes=512,timeout=15,prefix=True)
            code=re.search(rb'<Code>([A-Za-z]{1,64})</Code>',b)
            expires=parse_qs(url.query).get('Expires',[''])[0]
            print('CDN_PROBE',obj,path,status,h.get_content_type(),'bytes',len(b),'ms',round(1000*(time.monotonic()-start)),
                  'ttl',int(expires)-int(time.time()) if expires.isdigit() else None,'oss',code[1].decode() if code else '-',
                  'server',re.sub(r'[^A-Za-z0-9_. -]','',h.get('Server',''))[:35],flush=True)
        except (OSError,http.client.HTTPException,ValueError) as e:
            print('CDN_PROBE',obj,path,type(e).__name__,type(getattr(e,'reason',None)).__name__,round(1000*(time.monotonic()-start)),flush=True)
items=[item for item in o.gallery(8) if str(item.get('mime_type')).startswith('image/')][:3]
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:list(pool.map(probe,items))
