import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// List of paths that require authentication
const protectedPaths = ['/dashboard', '/profile', '/settings']

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient(
    { req, res },
    {
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
      supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    }
  )

  const {
    data: { session },
  } = await supabase.auth.getSession()

  const path = req.nextUrl.pathname

  // Only check authentication for protected paths
  if (protectedPaths.some(protectedPath => path.startsWith(protectedPath))) {
    if (!session) {
      const redirectUrl = new URL('/auth', req.url)
      return NextResponse.redirect(redirectUrl)
    }
  }

  // If user is signed in and tries to access auth page, redirect to home
  if (session && path === '/auth') {
    const redirectUrl = new URL('/', req.url)
    return NextResponse.redirect(redirectUrl)
  }

  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|images|api).*)'],
} 