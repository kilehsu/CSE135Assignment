#!/usr/bin/python3
import os
import sys
import cgi
import http.cookies
import uuid
import pickle
import datetime
import tempfile

# Use tempfile directory for session storage
SESSION_DIR = os.path.join(tempfile.gettempdir(), 'cgi_sessions_py')
if not os.path.exists(SESSION_DIR):
    try:
        os.makedirs(SESSION_DIR)
        os.chmod(SESSION_DIR, 0o777)
    except:
        pass

cookie_string = os.environ.get("HTTP_COOKIE")
cookie = http.cookies.SimpleCookie(cookie_string)
session_id = None
if "CGISESSID" in cookie:
    session_id = cookie["CGISESSID"].value

if not session_id:
    session_id = str(uuid.uuid4())
    print(f"Set-Cookie: CGISESSID={session_id}; Path=/")

session_file = os.path.join(SESSION_DIR, session_id)
session_data = {}

if os.path.exists(session_file):
    try:
        with open(session_file, 'rb') as f:
            session_data = pickle.load(f)
    except:
        pass

form = cgi.FieldStorage()
if "name" in form:
    session_data["name"] = form["name"].value

if "clear" in form:
    session_data = {}
    if os.path.exists(session_file):
        try:
            os.remove(session_file)
        except:
            pass

try:
    with open(session_file, 'wb') as f:
        pickle.dump(session_data, f)
except:
    pass

print("Content-Type: text/html\n")
print("<!DOCTYPE html>")
print("<html><body>")
print(f"<h1>Session Test (Python)</h1>")
print(f"<p>Hello, {session_data.get('name', 'Guest')}!</p>")
print("<form method='POST'>")
print("<label>Enter Name: <input type='text' name='name'></label>")
print("<button type='submit'>Save</button>")
print("</form>")
print("<br>")
print("<form method='POST'>")
print("<input type='hidden' name='clear' value='1'>")
print("<button type='submit'>Clear Session</button>")
print("</form>")
print("<br><a href='state-python.py'>Refresh Page</a>")
print("</body></html>")
