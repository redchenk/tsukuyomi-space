"""Offline retrieval acceptance; caller supplies labeled public questions and an index."""
import argparse
import importlib.util
import json
from pathlib import Path
import time
spec = importlib.util.spec_from_file_location('prepare', Path(__file__).with_name('prepare-site-knowledge.py'))
prepare = importlib.util.module_from_spec(spec); spec.loader.exec_module(prepare)
parser = argparse.ArgumentParser()
parser.add_argument('--database', type=Path, required=True); parser.add_argument('--models', type=Path, required=True)
parser.add_argument('--questions', type=Path, required=True); parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
store = prepare.module.KnowledgeStore(str(args.database), prepare.model_embed(args.models), prepare.sqlite_vec.load)
results = []
for q in json.loads(args.questions.read_text()):
    start = time.perf_counter(); response = store.search(q)
    matches = response['matches'][:5]; ids = [r['document_id'] for r in matches]
    results.append({**q, 'actual': ids, 'passed': q['expected'] in ids if q['expected'] else not ids,
                    'ms': round((time.perf_counter()-start)*1000, 2), 'mode': response['mode']})
positive = [r for r in results if r['expected']]; negative = [r for r in results if not r['expected']]
timings = sorted(r['ms'] for r in results)
report = {'cases': len(results), 'recall_at_5': sum(r['passed'] for r in positive)/len(positive),
          'no_answer_precision': sum(r['passed'] for r in negative)/len(negative),
          'p50_ms': timings[len(timings)//2], 'p95_ms': timings[int((len(timings)-1)*.95)], 'results': results}
args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2))
print(json.dumps({k:v for k,v in report.items() if k != 'results'}))
for r in results:
    if not r['passed']: print(json.dumps(r, ensure_ascii=False))
store.db.close()
