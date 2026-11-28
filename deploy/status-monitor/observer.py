"""Observe public visitor paths from outside the origin and reconcile Flashduty incidents."""
import concurrent.futures
import datetime as dt
import http.client
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

SITE = 'https://yachiyo.hk'
PAGE = 7223987941812
API = 'https://api.flashcat.cloud'
LABELS = {'site':'月读空间主站','api':'API 服务','login':'账号会话接口','content':'文章与广场',
          'gallery':'公开图库','room':'月读房间网页','cdn':'对象存储 / CDN','db':'数据库',
          'llm':'官方 LLM 对话','tts':'官方 TTS 语音'}
HEADER = '站点外部探针每分钟检查公开入口。官方 LLM、TTS 分别核验有效文本和默认音源音频，最近实测见「官方服务实时检测」。邮件投递、第三方登录和音乐播放由人工通报。'
PROBE_CHANGE = '月读空间自动检测'
STATES = {'up':'operational','unknown':'degraded','degraded':'degraded','down':'full_outage'}
MESSAGES = {'unknown':'暂时缺少有效检测结果，服务可用性待确认。','down':'连续检测未通过，当前检查的服务路径不可用。',
            'degraded':'实际业务请求出现异常，正在持续检查。','up':'连续检测恢复正常。'}

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args):
        return None

def fetch(url, headers=None, data=None, maxbytes=2*1024*1024, timeout=12, prefix=False):
    req=urllib.request.Request(url,data=data,headers={'User-Agent':'TsukuyomiStatus/1.0','Accept-Encoding':'identity',**(headers or {})})
    try:
        response=urllib.request.build_opener(NoRedirect).open(req,timeout=timeout)
    except urllib.error.HTTPError as error:
        response=error
    with response:
        body=response.read(maxbytes if prefix else maxbytes+1)
        if len(body)>maxbytes: raise ValueError('oversized response')
        return response.status,response.headers,body

def json_get(path, expected=200):
    status,_,body=fetch(SITE+path,{'Accept':'application/json','Cache-Control':'no-cache'})
    if status!=expected: raise ValueError('unexpected HTTP response')
    return json.loads(body)

def html(path):
    status,_,body=fetch(SITE+path,{'Accept':'text/html'})
    text=body.decode()
    bundle=re.search(r'<script[^>]+type="module"[^>]+src="(/assets/[a-zA-Z0-9_.-]+\.js)"', text)
    if status!=200 or '<h1' not in text or not bundle: return False
    status,headers,prefix=fetch(SITE+bundle[1],{'Range':'bytes=0-511'},maxbytes=512,prefix=True)
    return status in (200,206) and 'javascript' in headers.get_content_type() and bool(prefix.strip())

def gallery(limit=1):
    result=json_get('/api/assets/gallery?limit='+str(limit)+'&check='+str(int(time.time())))
    items=result['data']['assets']
    if result.get('success') is not True or not isinstance(items,list): raise ValueError('gallery response')
    return items

def image_read(location):
    headers={'Referer':SITE+'/gallery','Accept':'image/avif,image/webp,image/*,*/*;q=0.8'}
    if re.fullmatch(r'/api/assets/proxy/[a-zA-Z0-9-]+',location):
        status,redirect,_=fetch(SITE+location,headers,maxbytes=512,timeout=5,prefix=True)
        if status==200: return 'unverified_target'
        if status not in (301,302,303,307,308): return 'proxy_'+str(status)
        location=redirect.get('Location','')
    url=urllib.parse.urlsplit(location)
    if url.scheme!='https' or url.netloc!='oss.yachiyo.hk': return 'unverified_target'
    # Gallery images load with an ordinary GET. Read only enough bytes to identify the file.
    status,meta,body=fetch(location,headers,maxbytes=512,timeout=5,prefix=True)
    if status not in (200,206): return 'http_'+str(status)
    image=(body.startswith((b'\x89PNG\r\n\x1a\n',b'\xff\xd8\xff',b'GIF87a',b'GIF89a')) or
           (body[:4]==b'RIFF' and body[8:12]==b'WEBP') or
           (body[4:8]==b'ftyp' and body[8:12] in (b'avif',b'avis',b'heic',b'heix',b'mif1')))
    return 'ok' if image and meta.get_content_type().startswith('image/') else 'invalid_image'

def image_result(location):
    try: return image_read(location)
    except (http.client.HTTPException,OSError,ValueError,TypeError): return 'transport_error'

def cdn_object(item):
    preview=item.get('preview_url') or item.get('access_url') or item.get('display_url')
    first=image_result(preview)
    if first=='ok': return 'ok'
    backup=item.get('access_url') or item.get('display_url')
    if not backup or backup==preview: return first
    return first+'>'+image_result(backup)

def cdn_region():
    try: items=gallery(8)
    except (http.client.HTTPException,OSError,ValueError,TypeError,KeyError): items=[]
    selected={}
    for item in items:
        if not isinstance(item,dict) or not str(item.get('mime_type','')).startswith('image/'): continue
        ident=item.get('id')
        if isinstance(ident,str) and ident: selected[ident]=item
        if len(selected)>=3: break
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        samples=list(pool.map(cdn_object,selected.values()))
    good=sum(v=='ok' or v.endswith('>ok') for v in samples)
    verified=[v for v in samples if 'unverified_target' not in v]
    if not samples or (not good and len(verified)<2): state='unknown'
    elif all(v=='ok' for v in samples): state='up'
    elif good or len(verified)!=len(samples): state='degraded'
    else: state='down'
    print('cdn samples: '+(','.join(samples) or 'no_gallery_samples'),file=sys.stderr,flush=True)
    return {'state':state,'checkedAt':int(time.time()*1000)}

def combined_cdn(external,domestic,now):
    if not isinstance(domestic,dict) or type(domestic.get('checkedAt')) is not int or not -10000<=now-domestic['checkedAt']<=180000:
        domestic={}
    domestic=domestic.get('state','unknown')
    if domestic not in STATES: domestic='unknown'
    if domestic==external: return external
    if {domestic,external}=={'up','unknown'}: return 'unknown'
    return 'degraded'

def llm_gateway(sample,now):
    measured=ai_state(sample,'llm',now)
    try:
        reachable=(json_get('/official-api/healthz').get('status')=='ok' and
                   json_get('/official-api/v1/models',401).get('error',{}).get('code')=='SITE_LOGIN_REQUIRED')
    except (http.client.HTTPException,OSError,ValueError,KeyError,TypeError): reachable=False
    if reachable or measured=='down': return measured
    return 'degraded' if measured in ('up','degraded') else 'unknown'

def content():
    for path in ['/api/articles?limit=1','/api/messages?limit=1']:
        result=json_get(path)
        if result.get('success') is not True or not isinstance(result.get('data'),list): return False
    return True

def ai_state(sample, key, now):
    value=sample.get('services',{}).get(key) if isinstance(sample,dict) and isinstance(sample.get('services'),dict) else None
    if not isinstance(value,dict): return 'unknown'
    if sample.get('version')!=1 or value.get('state') not in STATES: return 'unknown'
    checked=value.get('checkedAt');observed=value.get('observedAt')
    if not all(isinstance(x,int) and not isinstance(x,bool) for x in (checked,observed)): return 'unknown'
    if not -30000<=now-checked<=180000 or not -30000<=now-observed<=1080000: return 'unknown'
    return value['state']

def collect():
    stamp=int(time.time()*1000)
    try: snapshot=json_get('/api/health/official?check='+str(stamp))
    except Exception: snapshot={}
    def tts():
        result=json_get('/api/tts/official/status')
        if result.get('success') is not True: return 'unknown'
        online=result.get('data',{}).get('online')
        if online is False: return 'down'
        if online is not True: return 'unknown'
        return ai_state(snapshot,'tts',stamp) if snapshot else 'unknown'
    tests={'site':lambda:html('/'),'api':lambda:json_get('/api/health?check='+str(stamp))['status']=='ok',
           'login':lambda:json_get('/api/auth/me',401).get('code')=='UNAUTHORIZED','content':content,
           'gallery':lambda:isinstance(gallery(),list),'room':lambda:html('/room'),'cdn':lambda:combined_cdn(cdn_region()['state'],snapshot.get('cdnProbe'),int(time.time()*1000)),
           'db':lambda: snapshot.get('databaseRead','unknown'),'llm':lambda:llm_gateway(snapshot,stamp),'tts':tts}
    def check(pair):
        name,fn=pair
        try:
            value=fn()
            state=('up' if value else 'down') if isinstance(value,bool) else value
            return name, state if state in STATES else 'unknown'
        except (http.client.HTTPException,OSError,ValueError,KeyError,TypeError): return name,'down'
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        return dict(pool.map(check,tests.items()))

def flash(key, endpoint, params, post=False):
    if params.get('page_id')!=PAGE: raise ValueError('unexpected destination')
    query={'app_key':key}
    if not post: query.update(params)
    url=API+endpoint+'?'+urllib.parse.urlencode(query)
    headers={'Accept':'application/json'}
    if post: headers['Content-Type']='application/json'
    status,_,body=fetch(url,headers,json.dumps(params).encode() if post else None)
    response=json.loads(body)
    if status!=200 or response.get('error') or response.get('error_code') or not isinstance(response.get('data'),(dict,type(None))):
        raise RuntimeError('status-page request failed: '+str(status)+' '+str(response.get('error_code',''))[:12])
    return response.get('data') or {}

def thresholds(previous, state, now):
    consecutive=previous.get('value')==state and 0<=now-previous.get('when',0)<=210
    return {'value':state,'when':now,'count':min(3,previous.get('count',0)+1) if consecutive else 1}

def active_by_component(incidents, component, title):
    own=None; occupied=False
    for event in incidents:
        if any(c.get('component_id')==component for c in event.get('affected_components',[])):
            if event.get('type')=='incident' and event.get('title')==title and not event.get('notify_subscribers'):
                own=event
            else: occupied=True
    return own, occupied

def reconcile(key, results, history, now):
    info=flash(key,'/status-page/info',{'page_id':PAGE})
    if info.get('custom_domain')!='status.yachiyo.hk': raise RuntimeError('status page domain mismatch')
    ids={c['name']:c['component_id'] for c in info['components']}
    active=[]
    for typ in ('incident','maintenance'):
        active.extend(flash(key,'/status-page/change/active/list',{'page_id':PAGE,'type':typ}).get('items',[]))
    for name,state in results.items():
        if LABELS[name] not in ids: continue
        component=ids[LABELS[name]]
        title=PROBE_CHANGE+' · '+LABELS[name]
        previous=history.get(name,{})
        entry=thresholds(previous,state,now)
        history[name]=entry
        if entry['count']<2: continue
        own,occupied=active_by_component(active,component,title)
        if occupied or (not own and state=='up'): continue
        message=MESSAGES[state]
        if name=='cdn':
            message={'up':'境内和境外巡检均读到了图库图片，预览路径正常。',
                     'degraded':'部分图片、预览路径或区域异常；请参照实际访问情况。',
                     'unknown':'图库样本或区域检测结果不足，当前可用性待验证。',
                     'down':'境内和境外均无法通过预览或备用地址读取多张图库图片。'}[state]
        if name=='llm' and state=='degraded':
            message='近期请求、模型出口或公网入口存在异常。具体生成证据及时间见官方服务实时检测。'
        # Unknown and degraded have the same platform severity but different evidence.
        changes=[{'component_id':component,'status':STATES[state]}]
        if not own:
            update={'status':'investigating','description':message,'component_changes':changes}
            flash(key,'/status-page/change/create',{'page_id':PAGE,'type':'incident','title':title,'status':'investigating',
                  'description':message,'notify_subscribers':False,'updates':[update]},True)
        else:
            detail=flash(key,'/status-page/change/info',{'page_id':PAGE,'change_id':own['change_id']})
            latest=max(detail.get('updates',[]),key=lambda x:int(x.get('at_seconds') or 0),default={})
            if latest.get('description')==message and state!='up': continue
            flash(key,'/status-page/change/timeline/create',{'page_id':PAGE,'change_id':own['change_id'],
                  'status':'resolved' if state=='up' else 'monitoring','description':message,'component_changes':changes},True)
    header=info.get('page_header','')
    if (header==HEADER or header.startswith(HEADER+' 最近巡检')) and now-history.get('header',0)>=300:
        timestamp=dt.datetime.fromtimestamp(now,dt.timezone(dt.timedelta(hours=8))).strftime('%m-%d %H:%M')
        flash(key,'/status-page/update',{'page_id':PAGE,'page_header':HEADER+' 最近巡检 '+timestamp+'（北京时间）。巡检时间超过 10 分钟未更新时，页面状态待验证。'},True)
        history['header']=now

def main():
    if '--sample-cdn' in sys.argv:
        file=Path(os.environ['STATE_DIRECTORY'])/'public.json'
        tmp=file.with_suffix('.next')
        tmp.write_text(json.dumps(cdn_region())); tmp.replace(file)
        return
    results=collect()
    print(json.dumps(results,sort_keys=True),flush=True)
    if '--check' in sys.argv: return
    directory=Path(os.environ['STATE_DIRECTORY'])
    memory=directory/'history.json'
    history=json.loads(memory.read_text()) if memory.exists() else {}
    key=(Path(os.environ['CREDENTIALS_DIRECTORY'])/'flashduty').read_text().strip()
    reconcile(key, results, history, int(time.time()))
    tmp=directory/'history.next'
    tmp.write_text(json.dumps(history)); tmp.replace(memory)

if __name__=='__main__':
    try: main()
    except Exception as e:
        # Transport exceptions can contain authenticated URLs.
        print('Observer did not complete:',type(e).__name__,file=sys.stderr); sys.exit(1)
