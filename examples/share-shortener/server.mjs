import { URL } from 'node:url';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import console from 'node:console';
import { createServer } from 'node:http';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const recipient = new URL(process.env.EDITOR_URL ?? 'http://127.0.0.1:4173/');
const publicUrl = new URL(process.env.PUBLIC_URL ?? 'http://127.0.0.1:4180/');

createServer(async (request, response) => {
  const route = new URL(request.url, publicUrl);
  // This example allows only the configured embedding origin.
  response.setHeader('Access-Control-Allow-Origin', recipient.origin);
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  if (request.method === 'OPTIONS') {
    response.writeHead(204).end();
    return;
  }
  try {
    if (request.method === 'POST' && route.pathname === '/links') {
      let body = '';
      for await (const chunk of request) {
        body += chunk;
        if (Buffer.byteLength(body) > 64 * 1024) {
          response.writeHead(413).end();
          return;
        }
      }
      const { url } = JSON.parse(body);
      if (typeof url !== 'string') {
        response.writeHead(400).end('Invalid URL');
        return;
      }
      const destination = new URL(url);
      if (
        destination.origin !== recipient.origin ||
        destination.pathname !== recipient.pathname ||
        !['http:', 'https:'].includes(destination.protocol)
      ) {
        response.writeHead(400).end('Invalid recipient');
        return;
      }
      const link = await prisma.shareLink.create({
        data: { url: destination.href },
      });
      response
        .writeHead(201, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ url: new URL(`/s/${link.id}`, publicUrl).href }));
      return;
    }
    if (request.method === 'GET' && /^\/s\/[a-z0-9]+$/.test(route.pathname)) {
      const link = await prisma.shareLink.findUnique({
        where: { id: route.pathname.slice(3) },
      });
      if (link) {
        response.writeHead(302, { Location: link.url }).end();
        return;
      }
    }
    response.writeHead(404).end('Not found');
  } catch {
    response.writeHead(400).end('Unable to process share link');
  }
}).listen(4180, '127.0.0.1', () =>
  console.log(`Shortener listening at ${publicUrl}`),
);
