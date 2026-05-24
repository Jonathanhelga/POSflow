FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev 
# npm ci It installs project dependencies directly from the package-lock.json

COPY . .

ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
