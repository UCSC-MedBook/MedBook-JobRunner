FROM node:0.10
MAINTAINER Mike Risse

RUN apt-get update
RUN apt-get install -y curl
RUN curl https://install.meteor.com | /bin/sh

EXPOSE 3000
ENV PORT 3000

RUN mkdir /bundle
ENV RELEASE=1.1.0.2

RUN meteor --release $RELEASE update
ADD webapp /app
WORKDIR /app

RUN meteor build --release $RELEASE --directory /build
WORKDIR /build/bundle/programs/server
RUN npm install
WORKDIR /build/bundle

CMD ["node", "main.js"]
