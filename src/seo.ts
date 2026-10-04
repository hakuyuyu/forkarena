export const HOST = "forkarena.fordidofour.workers.dev";
export const ORIGIN = `https://${HOST}`;
export const INDEXNOW_KEY = "5cc7ffd833c60503c1e6cb14af94d5fd";

export const ROBOTS = `User-agent: *
Allow: /
Disallow: /api/

Sitemap: ${ORIGIN}/sitemap.xml
`;

export const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>${ORIGIN}/</loc></url>
</urlset>
`;
