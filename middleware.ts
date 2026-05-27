import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"
import { ROUTE_PERMISSION_MAP } from "@/lib/permissions"

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token
    const pathname = req.nextUrl.pathname

    // Admin panel: ADMIN and MANAGER only
    if (pathname.startsWith("/admin") && token?.role !== "ADMIN" && token?.role !== "MANAGER") {
      return NextResponse.redirect(new URL("/", req.url))
    }

    // Permission-based route protection
    // Skip API routes — those protect themselves via getServerSession
    if (!pathname.startsWith("/api/")) {
      const perms = (token?.permissions as string[] | undefined) ?? []
      for (const { prefix, key } of ROUTE_PERMISSION_MAP) {
        if (pathname.startsWith(prefix)) {
          if (!perms.includes(key)) {
            return NextResponse.redirect(new URL("/", req.url))
          }
          break
        }
      }
    }

    return NextResponse.next()
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
    pages: {
      signIn: "/login",
    },
  }
)

export const config = {
  matcher: [
    "/((?!login|api/auth|api/debug-auth|_next/static|_next/image|favicon\\.ico).*)",
  ],
}
