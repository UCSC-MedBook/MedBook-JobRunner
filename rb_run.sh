if [ -d "webapp" ]; then
    cd webapp
fi

if [ -z "$1" ]; then
    MONGO_URL="mongodb://localhost:27017/MedBook" meteor --port 3003 --settings ../rb_settings.json
else
    MONGO_URL="mongodb://localhost:27017/MedBook" meteor $1 --port 3003 --settings ../rb_settings.json
fi
