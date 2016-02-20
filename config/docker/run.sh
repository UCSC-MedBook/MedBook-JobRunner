#! /usr/bin/env bash

cd /app-dev
export MONGO_URL=mongodb://mongo:27017/MedBook
meteor --release $RELEASE
