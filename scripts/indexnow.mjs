// Ping IndexNow with this worker's URLs. Run after each deploy: npm run indexnow
import { HOST, INDEXNOW_KEY, ORIGIN } from "../src/seo.ts";

const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify({
    host: HOST,
    key: INDEXNOW_KEY,
    keyLocation: `${ORIGIN}/${INDEXNOW_KEY}.txt`,
    urlList: [`${ORIGIN}/`],
  }),
});
console.log(`IndexNow ${res.status}`);
if (!res.ok) process.exit(1);
