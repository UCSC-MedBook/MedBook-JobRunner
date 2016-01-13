export MONGO_URL="mongodb://localhost:27017/MedBook"

export settings_file="../config/starrynight/settings.json"
export port="3003"

if [ -z "$1" ]; then
    meteor --port $port --settings $settings_file
else
    meteor $1 --port $port --settings $settings_file
fi
