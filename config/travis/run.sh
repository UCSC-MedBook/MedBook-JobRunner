export MONGO_URL="mongodb://localhost:27017/MedBook"

export settings_file="../config/travis/settings.json"
export port="3003"

if [ -z "$1" ]; then
    ~/.meteor/meteor --port $port --settings $settings_file
else
    ~/.meteor/meteor meteor $1 --port $port --settings $settings_file
fi
