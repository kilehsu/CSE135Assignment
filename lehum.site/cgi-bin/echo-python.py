#!/usr/bin/python3
import os
import sys
import json
import datetime
from urllib.parse import parse_qs

print("Content-Type: application/json\n")

method = os.environ.get('REQUEST_METHOD', 'GET')
content_type = os.environ.get('CONTENT_TYPE', '')
content_length = os.environ.get('CONTENT_LENGTH', '0')
try:
    content_length = int(content_length)
except:
    content_length = 0

body_str = ""
if content_length > 0:
    try:
        body_str = sys.stdin.read(content_length)
    except:
        pass

data = {}
if method == 'GET':
    query_string = os.environ.get('QUERY_STRING', '')
    parsed = parse_qs(query_string)
    data = {k: v[0] if len(v) == 1 else v for k, v in parsed.items()}
else:
    if 'application/json' in content_type:
        try:
            data = json.loads(body_str)
        except:
            data = {"error": "Invalid JSON", "raw": body_str}
    else:
        parsed = parse_qs(body_str)
        data = {k: v[0] if len(v) == 1 else v for k, v in parsed.items()}

headers = {}
for k, v in os.environ.items():
    if k.startswith('HTTP_'):
        headers[k] = v

response = {
    "received": {
        "method": method,
        "headers": headers,
        "body": data,
        "raw_body": body_str
    },
    "meta": {
        "hostname": os.environ.get('SERVER_NAME', ''),
        "date": str(datetime.datetime.now()),
        "ip": os.environ.get('REMOTE_ADDR', ''),
        "user_agent": os.environ.get('HTTP_USER_AGENT', '')
    }
}

print(json.dumps(response, indent=2))
