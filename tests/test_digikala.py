import unittest
from unittest.mock import patch

from cartoptimizer.adapters.digikala import fetch_product, parse_product_html, product_url
from cartoptimizer.models import ValidationError

URL = 'https://www.digikala.com/product/dkp-12345/example/'


class DigikalaTests(unittest.TestCase):
    def test_irr_and_irt_conversion_and_review_required(self):
        for currency, expected in [('IRR', 12345), ('IRT', 123450)]:
            html = '<script type="application/ld+json">{"@graph":[{"@type":"Product","name":"شیر", "offers":{"@type":"Offer","price":"12345","priceCurrency":"' + currency + '"}}]}</script>'
            result = parse_product_html(html, URL)
            self.assertEqual(result['observed_price'], expected)
            self.assertFalse(result['confirmed'])
            self.assertNotIn('stock', result)
            self.assertNotIn('promo_limit', result)

    def test_aggregate_price_and_challenge_fail_closed(self):
        pages = ['<html>Please enable JavaScript</html>', '<script type="application/ld+json">{bad json}</script>',
                 '<script type="application/ld+json">{"@type":"Product","name":"Milk","offers":{"@type":"AggregateOffer","lowPrice":1000,"priceCurrency":"IRR"}}</script>']
        for page in pages:
            with self.subTest(page=page), self.assertRaises(ValidationError): parse_product_html(page, URL)

    def test_no_ssrf_or_credentials_or_nonstandard_ports(self):
        for url in ['http://www.digikala.com/product/dkp-1/', 'https://127.0.0.1/product/dkp-1/',
                    'https://www.digikala.com.evil.test/product/dkp-1/', 'https://user@www.digikala.com/product/dkp-1/',
                    'https://www.digikala.com:9000/product/dkp-1/', 'https://www.digikala.com:bad/product/dkp-1/',
                    'https://www.digikala.com/fresh/']:
            with self.subTest(url=url), self.assertRaises(ValidationError): product_url(url)

    def test_tracking_query_removed(self):
        self.assertEqual(product_url(URL + '?track=private#fragment'), URL)

    def test_network_failure_no_fake_fallback(self):
        with patch('cartoptimizer.adapters.digikala.build_opener', side_effect=TimeoutError):
            with self.assertRaisesRegex(ValidationError, 'no live price was substituted'):
                fetch_product(URL)


if __name__ == '__main__':
    unittest.main()
