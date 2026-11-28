import importlib.util
import pathlib
import unittest
from unittest.mock import patch

path = pathlib.Path(__file__).resolve().parents[1]/'deploy/status-monitor/observer.py'
spec = importlib.util.spec_from_file_location('observer', path)
observer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(observer)


class ObserverTest(unittest.TestCase):
    def test_missing_or_old_samples_are_unknown(self):
        for snapshot in ({}, {'services':[]}, {'version':1,'services':{'tts':{'state':'up','checkedAt':1,'observedAt':1}}}):
            self.assertEqual(observer.ai_state(snapshot,'tts',200000), 'unknown')

    def test_gallery_fallback_and_independent_objects(self):
        assets=[{'id':str(i),'mime_type':'image/png','preview_url':'preview'+str(i),'access_url':'fallback'} for i in range(3)]
        for primary,fallback,expected in [('ok','ok','up'),('http_403','ok','degraded'),('http_503','http_503','down')]:
            with patch.object(observer,'gallery',return_value=assets), patch.object(observer,'image_result',side_effect=lambda u:fallback if u=='fallback' else primary):
                self.assertEqual(observer.cdn_region()['state'],expected)
        with patch.object(observer,'gallery',return_value=[assets[0],assets[0]]),patch.object(observer,'image_result',return_value='transport_error'):
            self.assertEqual(observer.cdn_region()['state'],'unknown')
        with patch.object(observer,'gallery',side_effect=ValueError()):
            self.assertEqual(observer.cdn_region()['state'],'unknown')

    def test_fresh_regional_corroboration_and_gateway(self):
        now=200000
        for external,domestic,age,expected in [('down','down',0,'down'),('up','up',0,'up'),('down','up',0,'degraded'),
                                                ('up','down',0,'degraded'),('down','down',181000,'degraded'),('up','up',181000,'unknown')]:
            self.assertEqual(observer.combined_cdn(external,{'state':domestic,'checkedAt':now-age},now),expected)
        snapshot={'version':1,'services':{'llm':{'state':'up','checkedAt':now,'observedAt':now}}}
        with patch.object(observer,'json_get',side_effect=OSError()):
            self.assertEqual(observer.llm_gateway(snapshot,now),'degraded')
            self.assertEqual(observer.llm_gateway({},now),'unknown')

    def test_tts_billing_failure_uses_current_synthesis_evidence(self):
        now=200000
        for online,observed,expected in [(False,'unknown','unknown'),(True,'degraded','degraded'),(False,'down','down'),(True,'up','degraded')]:
            snapshot={'version':1,'services':{'tts':{'state':observed,'checkedAt':now,'observedAt':now}}}
            self.assertEqual(observer.tts_state({'data':{'reason':'credit_unavailable','online':online}},snapshot,now),expected)
        self.assertEqual(observer.tts_state({'data':{'reason':'offline','online':False}},{},now),'down')

    def test_read_and_write_use_the_supported_flashduty_encoding(self):
        with patch.object(observer,'fetch',return_value=(200,{},b'{"data":{}}')) as fetch:
            observer.flash('fixture','/status-page/info',{'page_id':observer.PAGE})
            _, headers, body = fetch.call_args.args
            self.assertIsNone(body)
            self.assertNotIn('Content-Type',headers)
            observer.flash('fixture','/status-page/update',{'page_id':observer.PAGE},True)
            _, headers, body = fetch.call_args.args
            self.assertEqual(headers['Content-Type'],'application/json')
            self.assertIsNotNone(body)
            with self.assertRaises(ValueError):
                observer.flash('fixture','/status-page/info',{'page_id':0})

    def test_incident_lifecycle_is_idempotent_and_silent(self):
        events = []
        writes = []
        info = {'custom_domain':'status.yachiyo.hk','components':[{'name':observer.LABELS['tts'],'component_id':'voice'}]}
        def api(key, endpoint, value, post=False):
            self.assertEqual(value['page_id'],observer.PAGE)
            if endpoint.endswith('/info') and 'change_id' not in value: return info
            if endpoint.endswith('/active/list'): return {'items':events if value['type']=='incident' else []}
            if endpoint.endswith('/change/info'): return events[0]
            self.assertTrue(post)
            writes.append(value.copy())
            if endpoint.endswith('/change/create'):
                self.assertFalse(value['notify_subscribers'])
                events.append(dict(value,change_id=1,affected_components=[{'component_id':'voice'}]))
            elif value['status']=='resolved': events.clear()
            return {}
        history = {}
        with patch.object(observer,'flash',api):
            for now,state in enumerate(['down','down','down','up','up']):
                observer.reconcile('test',{'tts':state},history,now)
            self.assertEqual([v['status'] for v in writes],['investigating','resolved'])
            self.assertEqual(writes[-1]['component_changes'][0]['status'],'operational')
            events.append({'title':'人工事件','type':'incident','affected_components':[{'component_id':'voice'}]})
            for now in (100,160):
                observer.reconcile('test',{'tts':'down'},history,now)
            self.assertEqual(len(writes),2)
        self.assertEqual(observer.thresholds({'value':'down','when':100,'count':2},'down',360)['count'],1)

if __name__=='__main__': unittest.main()
