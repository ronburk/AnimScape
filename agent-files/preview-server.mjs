// Temporary cloud-browser adapter; excluded from the production build.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

let host = '0.0.0.0';
let port = 4173;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; ++i) {
    if (args[i] === '--host') host = args[++i];
    else if (args[i] === '--port') port = Number(args[++i]);
    else if (args[i] !== '--strictPort') throw new Error('Unknown argument: ' + args[i]);
}

createServer(async (request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (path !== '/' && path !== '/AnimScape.html') {
        response.writeHead(404).end();
        return;
    }
    try {
        const html = await readFile(new URL('../AnimScape.html', import.meta.url));
        response.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store'
        });
        response.end(html);
    } catch (error) {
        console.error(error);
        response.writeHead(500).end('Unable to read AnimScape.html');
    }
}).listen(port, host, () => console.log('AnimScape preview ready'));
