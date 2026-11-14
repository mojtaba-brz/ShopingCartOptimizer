"""Public image proxy. No cookies, redirects or arbitrary destinations."""
from urllib.parse import urlsplit
from urllib.request import Request, build_opener
from .desktop import NoRedirect


def read_image(url):
    u = urlsplit(url)
    if (u.scheme != 'https' or u.hostname not in {'dkstatics-public.digikala.com',
            'dkstatics-public.digikalajet.ir', 'images.digikalajet.ir'}
            or u.username or u.password or u.port not in (None, 443)):
        raise ValueError('Unsupported image')
    with build_opener(NoRedirect).open(Request(url, headers={'Accept': 'image/*'}), timeout=8) as r:
        mime = r.headers.get_content_type()
        data = r.read(2 * 1024 * 1024 + 1)
        if mime not in {'image/jpeg', 'image/png', 'image/webp', 'image/avif'} or len(data) > 2 * 1024 * 1024:
            raise ValueError('Invalid image')
        return data, mime
