import createIntlMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { routing } from './i18n/routing';

const intlMiddleware = createIntlMiddleware(routing);

const PROTECTED_PATHS = ['/movies/collection', '/movies/recent'];
const LOCALE_PREFIX_REGEX = new RegExp(`^/(${routing.locales.join('|')})(?=/|$)`);
const LOCALE_COOKIE = 'NEXT_LOCALE';
const LOCALE_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 365;

/**
 * Vercel-only geo signal. Returns null on local dev / non-Vercel hosts so the
 * caller falls through to next-intl's Accept-Language detection.
 *
 * Policy: VN → vi, every other country → en.
 */
function pickLocaleFromGeo(request: NextRequest): string | null {
  const country = request.geo?.country;
  
  // إذا لم يتمكن السيرفر من تحديد الدولة، نرجع null
  if (!country) return null;

  // خريطة اللغات حسب كود الدولة (تقدر تضيف وتعدل براحتك)
  const countryToLocale: Record<string, string> = {
    'VN': 'vi', // فيتنام
    'JO': 'ar', // الأردن
    'SA': 'ar', // السعودية
    'EG': 'ar', // مصر
    'AE': 'ar', // الإمارات
    'MA': 'ar', // المغرب
    'FR': 'fr', // فرنسا
    'ES': 'es'  // إسبانيا
  };

  // يبحث عن الدولة في الخريطة، إذا لقاها بيعطيها لغتها
  // إذا الدولة مش موجودة في القائمة، بيعطي إنجليزي 'en' كافتراضي
  return countryToLocale[country] || 'en';
}


export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const pathWithoutLocale = pathname.replace(LOCALE_PREFIX_REGEX, '') || '/';

  // Auth gate
  const isProtected = PROTECTED_PATHS.some((p) => pathWithoutLocale.startsWith(p));
  if (isProtected && !request.cookies.has('accessToken')) {
    const match = pathname.match(LOCALE_PREFIX_REGEX);
    const locale = match?.[1] ?? routing.defaultLocale;
    return NextResponse.redirect(new URL(`/${locale}`, request.url));
  }

  // Geo auto-detect — only for first-time bare-URL visitors. Manual choice
  // (stored in NEXT_LOCALE) wins forever after.
  const hasLocalePrefix = LOCALE_PREFIX_REGEX.test(pathname);
  const hasLocaleCookie = request.cookies.has(LOCALE_COOKIE);
  if (!hasLocalePrefix && !hasLocaleCookie) {
    const geoLocale = pickLocaleFromGeo(request);
    if (geoLocale) {
      const targetPath = pathname === '/' ? `/${geoLocale}` : `/${geoLocale}${pathname}`;
      const url = new URL(targetPath, request.url);
      url.search = request.nextUrl.search;

      const response = NextResponse.redirect(url);
      response.cookies.set(LOCALE_COOKIE, geoLocale, {
        path: '/',
        maxAge: LOCALE_COOKIE_MAX_AGE_SEC,
        sameSite: 'lax',
      });
      return response;
    }
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
