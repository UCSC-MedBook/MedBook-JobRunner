export MONGO_URL="mongodb://localhost:27017/MedBook"
export MEDBOOK_FILESTORE=/tmp/filestore

meteor --port 3003 --settings ../config/etk/settings.json
