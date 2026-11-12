// Tiny static server for the web app.
// Local:  node serve.js  ->  http://localhost:5173
// Azure App Service: uses the PORT it provides (a number on Linux, a named pipe on Windows).
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, 'webapp');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(root)) { res.writeHead(403); return res.end(); }
  if (p.endsWith(path.sep) || p === root) p = path.join(p, 'index.html');
  fs.readFile(p, (e, d) => {
    if (e) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' });
    res.end(d);
  });
});
const env = process.env.PORT;
if (env) server.listen(/^\d+$/.test(env) ? +env : env, () => console.log('Lavo listening on ' + env));
else server.listen(+process.argv[2] || 5173, '127.0.0.1', () => console.log('Lavo running at http://localhost:' + (+process.argv[2] || 5173)));
