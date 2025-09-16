FROM node:20-alpine

WORKDIR /usr/src/app

ENV NODE_ENV=production

COPY . .

ENV PORT=8080
EXPOSE 8080

CMD ["npm", "start"]
