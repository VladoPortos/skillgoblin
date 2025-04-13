// Server middleware to set cache control headers for HTML responses
export default defineEventHandler((event) => {
  // Set no-cache headers for HTML pages to prevent aggressive caching
  if (event.node.res.getHeader('Content-Type')?.includes('text/html')) {
    event.node.res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    event.node.res.setHeader('Pragma', 'no-cache');
    event.node.res.setHeader('Expires', '0');
  }
});
