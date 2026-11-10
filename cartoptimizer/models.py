"""Validated, marketplace-independent snapshot format (schema version 1)."""
from dataclasses import asdict, dataclass
from datetime import datetime, timezone


class ValidationError(ValueError):
    pass


def integer(value, field, low=0, high=10**13):
    if type(value) is not int or not low <= value <= high:
        raise ValidationError(f"{field}: expected an integer between {low} and {high}")
    return value


def label(value, field, limit=300):
    if not isinstance(value, str) or not value.strip() or len(value) > limit:
        raise ValidationError(f"{field}: expected nonempty text (up to {limit} characters)")
    return value.strip()


def flag(value, field):
    if type(value) is not bool:
        raise ValidationError(f"{field}: expected true or false")
    return value


def records(data, key, maximum, required=True):
    value = data.get(key, [])
    if not isinstance(value, list) or len(value) > maximum or (required and not value):
        raise ValidationError(f"{key}: expected {'1' if required else '0'}–{maximum} records")
    if any(not isinstance(row, dict) for row in value):
        raise ValidationError(f"{key}: each record must be an object")
    ids = [label(row.get('id'), f'{key}.id', 100) for row in value]
    if any(row['id'] != cleaned for row, cleaned in zip(value, ids)):
        raise ValidationError(f'{key}.id: leading/trailing whitespace is not allowed')
    if len(ids) != len(set(ids)):
        raise ValidationError(f"{key}: duplicate IDs")
    return value


@dataclass(frozen=True)
class Store:
    id: str
    name: str
    delivery_fee: int
    service_fee: int
    minimum_order: int
    free_delivery_over: int | None
    threshold_basis: str


@dataclass(frozen=True)
class Offer:
    id: str
    item_id: str
    store_id: str
    title: str
    regular_price: int
    stock: int
    promo_price: int | None
    promo_limit: int
    promo_scope: str
    confirmed: bool
    url: str


@dataclass(frozen=True)
class Coupon:
    id: str
    store_id: str
    code: str
    kind: str
    value: int
    minimum_spend: int
    maximum_discount: int | None
    max_uses: int
    removes_promotions: bool

    def discount(self, subtotal):
        amount = self.value if self.kind == 'fixed' else subtotal * self.value // 10000
        if self.maximum_discount is not None:
            amount = min(amount, self.maximum_discount)
        return min(subtotal, amount)


@dataclass(frozen=True)
class Snapshot:
    stores: tuple[Store, ...]
    offers: tuple[Offer, ...]
    coupons: tuple[Coupon, ...]
    items: tuple[tuple[str, str, int], ...]
    max_carts: int
    source: str
    captured_at: datetime
    context: str


def parse_snapshot(data, *, allow_draft=False):
    if not isinstance(data, dict):
        raise ValidationError('Snapshot must be a JSON object')
    if type(data.get('schema_version')) is not int or data['schema_version'] != 1:
        raise ValidationError('schema_version must be 1')
    if data.get('currency') != 'IRR':
        raise ValidationError('currency must be IRR; store amounts in rials (1 toman = 10 rials)')
    source = label(data.get('source'), 'source', 100)
    context = label(data.get('context'), 'context')
    try:
        captured = datetime.fromisoformat(data.get('captured_at', '').replace('Z', '+00:00'))
        if captured.utcoffset() is None:
            raise ValueError()
        if (captured - datetime.now(timezone.utc)).total_seconds() > 300:
            raise ValueError()
    except (ValueError, TypeError, AttributeError):
        raise ValidationError('captured_at must be an ISO timestamp with timezone, not in the future') from None
    stores = []
    for row in records(data, 'stores', 6):
        basis = row.get('threshold_basis', 'before_coupon')
        if basis not in ('before_coupon', 'after_coupon'):
            raise ValidationError('stores.threshold_basis must be before_coupon or after_coupon')
        free = row.get('free_delivery_over')
        stores.append(Store(row['id'], label(row.get('name'), 'stores.name'),
                            integer(row.get('delivery_fee', 0), 'delivery_fee'),
                            integer(row.get('service_fee', 0), 'service_fee'),
                            integer(row.get('minimum_order', 0), 'minimum_order'),
                            None if free is None else integer(free, 'free_delivery_over'), basis))
    store_ids = {s.id for s in stores}
    items = tuple((row['id'], label(row.get('name'), 'items.name'),
                   integer(row.get('quantity'), 'items.quantity', 1, 50))
                  for row in records(data, 'items', 15, required=not allow_draft))
    item_ids = {item[0] for item in items}
    offers = []
    for row in records(data, 'offers', 80, required=not allow_draft):
        if (not isinstance(row.get('store_id'), str) or not isinstance(row.get('item_id'), str)
                or row['store_id'] not in store_ids or row['item_id'] not in item_ids):
            raise ValidationError('Each offer must reference an existing store and shopping-list item')
        price = integer(row.get('regular_price'), 'regular_price', 1)
        promo = row.get('promo_price')
        if promo is not None:
            integer(promo, 'promo_price', 0, price)
        scope = row.get('promo_scope', 'account')
        if scope not in ('account', 'cart'):
            raise ValidationError('promo_scope must be account or cart')
        limit = integer(row.get('promo_limit', 0), 'promo_limit', 0, 50)
        if promo is None and limit:
            raise ValidationError('A promo_limit requires a promo_price')
        url = row.get('url', '')
        if not isinstance(url, str) or len(url) > 2000:
            raise ValidationError('offer.url must be text of at most 2000 characters')
        offers.append(Offer(row['id'], row['item_id'], row['store_id'],
                            label(row.get('title'), 'offers.title'), price,
                            integer(row.get('stock'), 'stock', 0, 500), promo, limit, scope,
                            flag(row.get('confirmed', False), 'offers.confirmed'), url))
    coupons = []
    for row in records(data, 'coupons', 8, required=False):
        if not isinstance(row.get('store_id'), str) or row['store_id'] not in store_ids:
            raise ValidationError('Coupon references an unknown store')
        kind = row.get('kind', 'fixed')
        if kind not in ('fixed', 'percent'):
            raise ValidationError('Coupon kind must be fixed or percent')
        cap = row.get('maximum_discount')
        coupons.append(Coupon(row['id'], row['store_id'], label(row.get('code'), 'coupon.code', 100),
                              kind, integer(row.get('value'), 'coupon.value', 1,
                                            10000 if kind == 'percent' else 10**13),
                              integer(row.get('minimum_spend', 0), 'coupon.minimum_spend'),
                              None if cap is None else integer(cap, 'coupon.maximum_discount'),
                              integer(row.get('max_uses', 1), 'coupon.max_uses', 1, 3),
                              flag(row.get('removes_promotions', True), 'coupon.removes_promotions')))
    return Snapshot(tuple(stores), tuple(offers), tuple(coupons), items,
                    integer(data.get('max_carts', 1), 'max_carts', 1, 3), source, captured, context)


def normalize_snapshot(data):
    """Return a validated draft with all optional model defaults made explicit."""
    parsed = parse_snapshot(data, allow_draft=True)
    departments = ('supermarket','pastry','produce','meat_shop','bakery','pet_shop','all_mart')
    for row in data.get('items', []):
        if 'department' in row and row['department'] not in departments:
            raise ValidationError('نوع فروشگاه معتبر نیست.')
    return {**data, 'stores': [asdict(s) for s in parsed.stores],
            'offers': [{**raw, **asdict(o)} for raw, o in zip(data.get('offers', []), parsed.offers)],
            'coupons': [asdict(c) for c in parsed.coupons],
            'items': [{'id': i, 'name': n, 'quantity': q, **({'department': row['department']} if 'department' in row else {})} for (i,n,q),row in zip(parsed.items,data.get('items', []))],
            'max_carts': parsed.max_carts}
