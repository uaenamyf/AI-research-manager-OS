/** 路由保护中间件：未登录（无 access_token cookie）访问受保护页面时重定向到登录页。 */
import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const token = req.cookies.get("access_token")?.value;
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

// 排除静态资源与公开页面（登录/注册）。注意：(auth) 路由组实际路径是 /login、/register。
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api|login|register).*)"],
};
