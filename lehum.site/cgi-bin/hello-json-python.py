#!/usr/bin/python3
import json
import datetime
import os

print("Content-Type: application/json\n")
data = {
    "message": "Hello Python World",
    "language": "Python",
    "date": str(datetime.datetime.now()),
    "ip": os.environ.get('REMOTE_ADDR', 'Unknown'),
    "team": ["Aaron Chiuwei", "Kile Hsu", "Varun Sharma"]
}
print(json.dumps(data))
