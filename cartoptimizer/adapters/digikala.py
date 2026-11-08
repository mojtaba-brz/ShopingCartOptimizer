"""Read public Digikala product structured data without account credentials.

This intentionally fails closed on challenge pages or unknown schemas. It does
not guess Fresh API URLs, inventory, promotional quotas or location-based fees.
"""
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from html.parser import HTMLParser
import json
import re
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit, urlunsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler

from ..models import ValidationError


def product_url(url):
    if not isinstance(url, str) or len(url) > 2000:
        raise ValidationError('Enter a Digikala product URL')
    try:
        parts = urlsplit(url)
        port = parts.port
    except ValueError:
        raise ValidationError('Invalid Digikala product URL') from None
    if (parts.scheme != 'https' or parts.hostname not in ('digikala.com', 'www.digikala.com')
            or parts.username or parts.password or port not in (None, 443)
            or not re.match(r'^/product/dkp-[0-9]+(?:/|$)', parts.path)):
        raise ValidationError('Use https://www.digikala.com/product/dkp-12345/ (a product page)')
    return urlunsplit(('https', 'www.digikala.com', parts.path, '', ''))


class RestrictedRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        product_url(newurl)  # Never follow redirects to arbitrary hosts or sign-in.
        return super().redirect_request(req, fp, code, msg, headers, newurl)


class StructuredData(HTMLParser):
    def __init__(self):
        super().__init__()
        self.active = False
        self.buffer = []
        self.documents = []

    def handle_starttag(self, tag, attrs):
        if tag == 'script' and dict(attrs).get('type', '').lower() == 'application/ld+json':
            self.active = True
            self.buffer = []

    def handle_data(self, data):
        if self.active:
            self.buffer.append(data)

    def handle_endtag(self, tag):
        if tag == 'script' and self.active:
            try:
                self.documents.append(json.loads(''.join(self.buffer)))
            except json.JSONDecodeError:
                pass
            self.active = False


def nodes(value):
    if isinstance(value, list):
        for entry in value:
            yield from nodes(entry)
    elif isinstance(value, dict):
        yield value
        if '@graph' in value:
            yield from nodes(value['@graph'])


def parse_product_html(html, url):
    url = product_url(url)
    parser = StructuredData()
    parser.feed(html)
    for node in nodes(parser.documents):
        types = node.get('@type', [])
        if isinstance(types, str):
            types = [types]
        if not isinstance(types, list) or 'Product' not in types:
            continue
        if not isinstance(node.get('name'), str) or not node['name'].strip():
            continue
        raw_offers = node.get('offers', [])
        if isinstance(raw_offers, dict):
            raw_offers = [raw_offers]
        if not isinstance(raw_offers, list):
            continue
        for offer in raw_offers:
            if not isinstance(offer, dict) or offer.get('@type') != 'Offer':
                continue  # Aggregate lowPrice is not an orderable seller quote.
            currency = offer.get('priceCurrency')
            if currency not in ('IRR', 'IRT'):
                continue
            try:
                amount = Decimal(str(offer['price'])) * (10 if currency == 'IRT' else 1)
                if not amount.is_finite() or amount <= 0 or amount != amount.to_integral_value() or amount > 10**13:
                    continue
            except (KeyError, InvalidOperation):
                continue
            return {'title': node['name'], 'observed_price': int(amount), 'currency': 'IRR',
                    'availability': offer.get('availability', 'unknown'), 'url': url,
                    'captured_at': datetime.now(timezone.utc).isoformat(), 'confirmed': False,
                    'warnings': ['Public-page price only; location and account eligibility are unverified.',
                                 'Confirm normal price, promotional price/quota, stock and seller in the GUI.']}
    raise ValidationError('No supported product price found. The page may need a selected location or be blocked. Enter the offer manually or import a reviewed snapshot.')


def fetch_product(url):
    url = product_url(url)
    request = Request(url, headers={'User-Agent': 'CartOptimizer/0.1 (public product metadata reader)',
                                   'Accept': 'text/html'})
    try:
        with build_opener(RestrictedRedirect).open(request, timeout=15) as response:
            content_type = response.headers.get('Content-Type', '')
            if 'text/html' not in content_type:
                raise ValidationError('Digikala did not return a product HTML page')
            body = response.read(2_000_001)
            if len(body) > 2_000_000:
                raise ValidationError('Product page exceeds the 2 MB import limit; enter the offer manually')
            return parse_product_html(body.decode('utf-8', errors='replace'), url)
    except (HTTPError, URLError, TimeoutError, OSError):
        raise ValidationError('Digikala could not be reached or blocked this request. Enter the offer manually or import a snapshot; no live price was substituted.') from None
