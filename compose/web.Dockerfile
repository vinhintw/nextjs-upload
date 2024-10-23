FROM node:18-alpine

RUN mkdir app
COPY ../prisma  ../app
COPY ../package.json ../app/
WORKDIR /app

RUN npm ci

# Start app
CMD ["npm", "run", "dev"]
