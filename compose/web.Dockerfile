FROM node:18-alpine

RUN mkdir app
COPY ../prisma  ../app
COPY ../package.json ../package-lock.json ./app/
WORKDIR /app

RUN npm install

# Start app
CMD ["npm", "run", "dev"]
