import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token
    const pathname = req.nextUrl.pathname

    // Admin panel: ADMIN and MANAGER only
    if (pathname.startsWith("/admin") && token?.role !== "ADMIN" && token?.role !== "MANAGER") {
      return NextResponse.redirect(new URL("/dashboard", req.url))
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
