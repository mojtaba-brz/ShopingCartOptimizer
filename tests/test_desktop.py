import json
from pathlib import Path
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
from cartoptimizer.desktop import DesktopService, point, validate_items
from cartoptimizer.models import ValidationError

ITEMS = [{'id': 'milk', 'name': 'شیر', 'query': 'شیر', 'quantity': 1}]
POINT = {'latitude': 35.75, 'longitude': 51.4, 'address': 'تهران، ونک'}


class DesktopTests(unittest.TestCase):
    def test_validated_location_survives_restart_and_clear(self):
        with tempfile.TemporaryDirectory() as folder:
            service = DesktopService(folder)
            with patch('cartoptimizer.desktop.public_json', return_value={'is_in_service_range': False}):
                with self.assertRaises(ValidationError):
                    service.select(POINT)
            self.assertFalse(service.location_file.exists())
            with patch('cartoptimizer.desktop.public_json', return_value={'is_in_service_range': True}):
                service.select(POINT)
            restarted = DesktopService(folder)
            self.assertIn('ونک', restarted.delivery()['location'])
            restarted.clear()
            self.assertEqual(DesktopService(folder).delivery(), {})

    def test_list_validation_rejects_duplicate_ids_and_invalid_quantities(self):
        for items in [[], ITEMS * 2, [{**ITEMS[0], 'quantity': True}], [{**ITEMS[0], 'quantity': 0}]]:
            with self.assertRaises(ValidationError):
                validate_items(items)
        for bad in [None, {**POINT, 'latitude': float('nan')}, {**POINT, 'latitude': True}]:
            with self.assertRaises(ValidationError):
                point(bad)

    def test_cancellation_discards_late_worker_result(self):
        entered, release, finished = threading.Event(), threading.Event(), threading.Event()
        def runner(items, location, report):
            entered.set()
            release.wait(3)
            finished.set()
            return {'items': items}
        with tempfile.TemporaryDirectory() as folder:
            service = DesktopService(folder, runner)
            service.location = POINT
            job = service.start(ITEMS)['id']
            self.assertTrue(entered.wait(2))
            service.cancel(job)
            release.set()
            self.assertTrue(finished.wait(2))
            time.sleep(.03)
            self.assertEqual(service.status(job)['state'], 'cancelled')
            self.assertNotIn('result', service.status(job))

    def test_only_one_job_can_run_and_location_cannot_change_mid_search(self):
        release = threading.Event()
        def runner(items, location, report):
            release.wait(3)
            return {'items': items}
        with tempfile.TemporaryDirectory() as folder:
            service = DesktopService(folder, runner)
            service.location = POINT
            job = service.start(ITEMS)['id']
            try:
                with self.assertRaises(ValidationError):
                    service.start(ITEMS)
                with patch('cartoptimizer.desktop.public_json', return_value={'is_in_service_range': True}):
                    with self.assertRaises(ValidationError):
                        service.select({**POINT, 'address': 'دیگر'})
                self.assertEqual(service.location['address'], POINT['address'])
            finally:
                service.cancel(job)
                release.set()

    def test_hardware_budget_is_bounded_and_preserves_three_cart_baseline(self):
        from cartoptimizer.desktop import resource_budget
        with patch('cartoptimizer.desktop.os.cpu_count', return_value=1):
            self.assertEqual(resource_budget()['workers'], 1)
            self.assertEqual(resource_budget()['max_carts'], 3)
        self.assertLessEqual(resource_budget()['workers'], 4)
        self.assertLessEqual(resource_budget()['max_carts'], 6)

    def test_release_is_shared_by_python_android_and_web(self):
        import cartoptimizer
        root = Path(__file__).resolve().parents[1]
        release = json.loads((root / 'cartoptimizer/release.json').read_text(encoding='utf-8'))
        self.assertEqual(cartoptimizer.__version__, release['version'])
        gradle = (root / 'android/app/build.gradle').read_text(encoding='utf-8')
        self.assertIn('cartwiseRelease.version', gradle)
        self.assertIn('cartwiseRelease.android_version_code', gradle)
        self.assertIn('release.json', gradle)
        self.assertIn('/assets/release.json', (root / 'cartoptimizer/web/version.js').read_text(encoding='utf-8'))
        for file in ['README.md', 'android/README.md', '.github/workflows/android.yml', 'release/prepare-publication-kit.py']:
            self.assertIn(release['version'], (root / file).read_text(encoding='utf-8'))
        for file in ['auto-ui.js', 'live.js']:
            text = (root / 'cartoptimizer/web' / file).read_text(encoding='utf-8')
            self.assertIn('CartwiseRetailer', text)
            self.assertNotIn('window.CartwiseAndroid', text)


if __name__ == '__main__':
    unittest.main()
