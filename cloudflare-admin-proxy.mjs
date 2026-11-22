const STORE_ORIGIN = "https://dojiyestore.com";

export default {
  async fetch(request) {
    const incomingUrl = new URL(request.url);
    const upstreamUrl = new URL(
      `${incomingUrl.pathname}${incomingUrl.search}`,
      STORE_ORIGIN,
    );

    if (upstreamUrl.pathname === "/" && !upstreamUrl.searchParams.has("admin")) {
      upstreamUrl.searchParams.set("admin", "1");
    }

    const headers = new Headers(request.headers);
    headers.delete("host");
    headers.delete("cf-access-jwt-assertion");
    headers.delete("cf-access-authenticated-user-email");

    const init = {
      method: request.method,
      headers,
      redirect: "manual",
    };
    if (request.method !== "GET" && request.method !== "HEAD") {
      init.body = request.body;
    }

    const upstreamResponse = await fetch(new Request(upstreamUrl, init));
    const responseHeaders = new Headers(upstreamResponse.headers);
    if (upstreamUrl.pathname.endsWith(".html") || upstreamUrl.pathname === "/") {
      responseHeaders.set("Cache-Control", "no-store");
      responseHeaders.set("CDN-Cache-Control", "no-store");
    }
    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  },
};
