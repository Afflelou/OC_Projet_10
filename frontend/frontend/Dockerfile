FROM node:18-alpine

COPY . /app
WORKDIR /app

RUN npm install -g @angular/cli
RUN npm ci


EXPOSE 8080
CMD ["ng", "serve", "--host", "0.0.0.0", "--port", "8080"]
