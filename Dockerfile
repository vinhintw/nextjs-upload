FROM node:18-alpine

RUN mkdir app
COPY ./prisma ./app/prisma
COPY ./package.json ./app/
COPY ./ ./app/
WORKDIR /app

RUN npm install

# Start app
CMD ["npm", "run", "dev"]
