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
