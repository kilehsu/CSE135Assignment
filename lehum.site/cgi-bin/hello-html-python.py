#!/usr/bin/python3
import datetime
import os

print("Content-Type: text/html\n")
print("<!DOCTYPE html>")
print("<html>")
print("<head><title>Hello Python World</title></head>")
print("<body>")
print("<h1 align='center'>Hello Python World</h1>")
print("<hr/>")
print("<p>Hello World</p>")
print("<p>This page was generated with the Python programming language</p>")
print(f"<p>This program was generated at: {datetime.datetime.now()}</p>")
print(f"<p>Your current IP Address is: {os.environ.get('REMOTE_ADDR', 'Unknown')}</p>")
print("<p>Team Members: Aaron Chiuwei, Kile Hsu, Varun Sharma</p>")
print("</body>")
print("</html>")
