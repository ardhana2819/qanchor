// Every route is static HTML at build time (NFR-022, ADR-011).
export const prerender = true;
// `/address` is served from `address.html`, matching Cloudflare Pages' routing.
export const trailingSlash = 'never';
