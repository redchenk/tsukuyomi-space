# Exact public game routes, including the independent CDN origin virtual host.
# Usage: python3 deploy/configure-kaguya-routes.py <domestic|overseas> <prepare|apply|rollback> <release-id>
import hashlib,json,os,pathlib,re,shutil,subprocess,sys,tempfile
site,command,rid=sys.argv[1:]
assert site in ('domestic','overseas') and command in ('prepare','apply','rollback')
assert re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,99}', rid)
state_dir=pathlib.Path('/var/backups/tsukuyomi-space/releases')/(rid+'-game-proxy-'+site)
paths=[pathlib.Path('/etc/nginx/conf.d/tsukuyomi-space.conf'),pathlib.Path('/opt/1panel/www/sites/yachiyo.hk/proxy/root.conf'),pathlib.Path('/opt/1panel/www/sites/origin.yachiyo.hk/proxy/root.conf')] if site=='domestic' else [pathlib.Path('/opt/1panel/www/conf.d/tsukuyomi-space.com.conf')]
tests=[['nginx','-t'],['docker','exec','1Panel-openresty-h9Tv','nginx','-t']] if site=='domestic' else [['docker','exec','1Panel-openresty-HX9X','nginx','-t']]
reloads=[['nginx','-s','reload'],['docker','exec','1Panel-openresty-h9Tv','nginx','-s','reload']] if site=='domestic' else [['docker','exec','1Panel-openresty-HX9X','nginx','-s','reload']]
def sha(b):return hashlib.sha256(b).hexdigest()
def install(p,source):
 info=p.stat();fd,name=tempfile.mkstemp(prefix='.game-r9-',dir=p.parent);os.close(fd)
 try:
  shutil.copyfile(source,name);os.chmod(name,info.st_mode&0o777);os.chown(name,info.st_uid,info.st_gid);os.replace(name,p)
 finally:
  if os.path.exists(name):os.unlink(name)
if command=='prepare':
 assert not state_dir.exists();state_dir.mkdir(parents=True,mode=0o700);entries=[]
 for i,p in enumerate(paths):
  assert not p.is_symlink();before=p.read_bytes();s=before.decode();assert 'kaguya-run-ef04c26b4900-r9' not in s
  match=re.search(r'(?m)^([ \t]*)location = /game-runtime/kaguya-run-ef04c26b4900-r7\.html \{[\s\S]*?^\1}',s);assert match, str(p)
  block=match[0].replace('-r7.html','-r9.html');archive=block.replace('-r9.html','-r9.sb3').replace('default_type text/html','default_type application/octet-stream')
  archive=re.sub(r'^.*Content-Disposition.*\n','',archive,flags=re.M)
  if 'alias ' in archive:archive=archive.replace('add_header Content-Encoding gzip always;','add_header Content-Encoding gzip always;\n'+match[1]+'    add_header Access-Control-Allow-Origin "*" always;')
  after=(s[:match.start()]+block+'\n\n'+archive+'\n\n'+s[match.start():]).encode()
  (state_dir/f'{i}-before.conf').write_bytes(before);(state_dir/f'{i}-after.conf').write_bytes(after)
  entries.append({'path':str(p),'before':sha(before),'after':sha(after)})
 (state_dir/'state.json').write_text(json.dumps({'status':'prepared','entries':entries})+'\n');print(site,'prepared exact r9 routes:',len(entries))
else:
 state=json.loads((state_dir/'state.json').read_text());assert [e['path'] for e in state['entries']]==[str(p) for p in paths]
 key='after' if command=='apply' else 'before';previous='before' if command=='apply' else 'after'
 for i,(p,e) in enumerate(zip(paths,state['entries'])):
  assert sha(p.read_bytes())==e[previous], 'Unexpected configuration drift'
  assert sha((state_dir/f'{i}-{key}.conf').read_bytes())==e[key]
 try:
  for i,p in enumerate(paths):install(p,state_dir/f'{i}-{key}.conf')
  for args in tests+reloads:subprocess.run(args,check=True,timeout=30)
 except Exception:
  for i,p in enumerate(paths):install(p,state_dir/f'{i}-{previous}.conf')
  for args in tests+reloads:subprocess.run(args,check=True,timeout=30)
  raise
 state['status']='active' if command=='apply' else 'rolled_back';(state_dir/'state.json').write_text(json.dumps(state)+'\n');print(site,state['status'])
