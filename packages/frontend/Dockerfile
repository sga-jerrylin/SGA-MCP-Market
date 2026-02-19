FROM node:20-alpine AS builder
WORKDIR /app
COPY tsconfig.base.json /tsconfig.base.json
COPY packages/frontend/package.json ./package.json
RUN npm install
COPY packages/frontend ./
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
EXPOSE 80
CMD ["node", "-e", "const http=require('http');const fs=require('fs');const path=require('path');const root=path.join(process.cwd(),'dist');const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};http.createServer((req,res)=>{const raw=(req.url||'/').split('?')[0];let filePath=path.join(root,raw==='/'?'/index.html':raw);if(!path.extname(raw)){filePath=path.join(root,'index.html');}fs.readFile(filePath,(err,data)=>{if(err){fs.readFile(path.join(root,'index.html'),(fallbackErr,fallback)=>{if(fallbackErr){res.statusCode=404;res.end('Not Found');return;}res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fallback);});return;}const ext=path.extname(filePath);if(types[ext])res.setHeader('Content-Type',types[ext]);res.end(data);});}).listen(80,'0.0.0.0');"]
