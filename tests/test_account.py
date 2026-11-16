import json
from pathlib import Path
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
from cartoptimizer.desktop import DesktopService
from cartoptimizer.models import ValidationError


class AccountTests(unittest.TestCase):
    def wait(self,service,key):
        for _ in range(100):
            row=service.status(key)
            if row['state']!='running':return row
            time.sleep(.01)
        self.fail('Account operation did not finish')

    def test_only_status_is_exposed_and_disconnect_preserves_delivery(self):
        with tempfile.TemporaryDirectory() as folder:
            service=DesktopService(folder);service.location={'latitude':35.75,'longitude':51.4,'address':'ونک'}
            service.location_file.write_text(json.dumps(service.location));sibling=Path(folder)/'lists.json';sibling.write_text('preserve')
            with patch('cartoptimizer.desktop.importlib.util.find_spec',return_value=object()),patch('cartoptimizer.account.connect',return_value={'status':'saved','channel':'chromium','cookie':'must-not-export'}):
                key=service.account_job('login')['id'];result=self.wait(service,key)
            self.assertEqual(result['result'],{'account_status':'saved'})
            self.assertEqual(service.account_status(),{'status':'saved'})
            self.assertNotIn('must-not-export',service.account_file.read_text())
            profile=service.account_directory/'chromium';profile.mkdir(parents=True);(profile/'fixture-private').write_text('private')
            restarted=DesktopService(folder);self.assertEqual(restarted.account_status()['status'],'saved')
            restarted.disconnect_account()
            self.assertFalse(service.account_directory.exists());self.assertTrue(service.location_file.exists());self.assertEqual(sibling.read_text(),'preserve')

    def test_search_uses_only_the_app_profile_and_records_expiry(self):
        received={}
        def runner(items,location,report,**options):
            received.update(options);return {'items':[],'account_status':'login_required'}
        with tempfile.TemporaryDirectory() as folder:
            service=DesktopService(folder,runner);service.location={'latitude':35,'longitude':51,'address':'ونک'};service._save_account({'channel':'chromium','status':'saved'})
            key=service.start([{'id':'m','name':'شیر','quantity':1}])['id'];self.wait(service,key)
            self.assertEqual(received['session_directory'],Path(folder)/'jet-browser'/'chromium')
            self.assertEqual(service.account_status()['status'],'login_required')

    def test_untrusted_channel_cannot_select_an_external_profile(self):
        with tempfile.TemporaryDirectory() as folder:
            service=DesktopService(folder);service.account_file.write_text(json.dumps({'status':'saved','channel':'../../other-profile'}))
            self.assertEqual(service.account_status()['status'],'disconnected')
            with self.assertRaises(ValidationError):service.account_job('cart')

    def test_cancelled_login_finishes_closing_before_profile_deletion(self):
        entered=threading.Event();release=threading.Event()
        def connect(directory,report,**kw):
            entered.set();release.wait(2);report();return {'status':'saved','channel':'chromium'}
        with tempfile.TemporaryDirectory() as folder,patch('cartoptimizer.desktop.importlib.util.find_spec',return_value=object()),patch('cartoptimizer.account.connect',side_effect=connect):
            service=DesktopService(folder);key=service.account_job('login')['id'];self.assertTrue(entered.wait(1));service.cancel(key)
            with self.assertRaises(ValidationError):service.disconnect_account()
            release.set()
            for _ in range(100):
                if not service.closing:break
                time.sleep(.01)
            service.disconnect_account();self.assertEqual(service.account_status()['status'],'disconnected')

if __name__=='__main__':unittest.main()
