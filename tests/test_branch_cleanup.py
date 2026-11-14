"""Repository cleanup must preserve active, protected and unmerged work."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location(
    'merged_branch_cleanup', Path(__file__).parents[1] / '.github/cleanup-merged-branches.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class BranchCleanupTests(unittest.TestCase):
    def fixture(self, fail_delete=False):
        heads = {'main': 'a' * 40, 'merged': 'b' * 40, 'active': 'c' * 40,
                 'protected': 'd' * 40, 'unmerged': 'e' * 40}
        calls = []

        def get(path):
            if path == '':
                return {'default_branch': 'main'}
            if path == '/branches/main':
                return {'commit': {'sha': heads['main']}}
            if path.startswith('/pulls?'):
                return [{'head': {'ref': 'active'}, 'base': {'ref': 'main'}}]
            if path.startswith('/branches?'):
                return [{'name': n, 'commit': {'sha': sha}, 'protected': n == 'protected'}
                        for n, sha in heads.items()]
            if path.startswith('/compare/'):
                sha = path.split('/compare/')[1].split('...')[0]
                return {'merge_base_commit': {'sha': 'f' * 40 if sha == heads['unmerged'] else sha}}
            raise AssertionError(path)

        def delete(name, sha):
            calls.append((name, sha))
            return not fail_delete

        return get, delete, calls

    def test_only_fully_merged_inactive_head_is_deleted(self):
        get, delete, calls = self.fixture()
        result = module.cleanup(get, delete)
        self.assertEqual(calls, [('merged', 'b' * 40)])
        self.assertEqual(result['deleted'], [{'branch': 'merged', 'sha': 'b' * 40}])
        self.assertEqual({x['branch'] for x in result['preserved']},
                         {'main', 'active', 'protected', 'unmerged'})

    def test_rejected_deletion_lease_is_reported_as_preserved(self):
        get, delete, calls = self.fixture(fail_delete=True)
        result = module.cleanup(get, delete)
        self.assertEqual(result['deleted'], [])
        self.assertTrue(any(x['branch'] == 'merged' and 'lease rejected' in x['reason']
                            for x in result['preserved']))
        self.assertEqual(len(calls), 1)

    def test_missing_containment_proof_cannot_delete(self):
        get, delete, calls = self.fixture()

        def unavailable(path):
            if path.startswith('/compare/'):
                raise RuntimeError('API unavailable')
            return get(path)

        with self.assertRaisesRegex(RuntimeError, 'API unavailable'):
            module.cleanup(unavailable, delete)
        self.assertEqual(calls, [])
