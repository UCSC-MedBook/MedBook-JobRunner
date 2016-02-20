#! /usr/bin/env bash

echo "hi"

cd /app-dev
export MONGO_URL=mongodb://mongo:27017/MedBook
meteor --release $RELEASE
