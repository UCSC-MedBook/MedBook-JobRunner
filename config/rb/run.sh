if [ -z "$1" ]; then
    MONGO_URL="mongodb://localhost:27017/MedBook" meteor --port 3003 --settings settings.json
else
    MONGO_URL="mongodb://localhost:27017/MedBook" meteor $1 --port 3003 --settings settings.json
fi
