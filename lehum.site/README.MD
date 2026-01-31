# HW1 Report

## Names
Aaron Chiuwei, Kile Hsu, Varun Sharma

## Credentials for Grader:
Linux user is "grader" and password is "VarunSharma12345!" <br>
HTTP Authentication to login to website follows same credentials <br>
IP for server is `159.89.157.16`

## Link to site:
### Link to main site and homepage
<https://www.lehum.site>
### Link to hello.php
<https://www.lehum.site/hw1/hello.php>
### Link to report.html
<https://www.lehum.site/hw1/report.html>

## Github Auto Deploy Setup
In order to deploy website changes from our local machine to the apache web server, we configured github to automatically deploy code to production using a webhook. We first created a webhook endpoint <https://www.lehum.site/deploy.php> which verifies the provided webhook secret matches the one we have generated. It then fetches the origin and uses git reset --hard in order to force the server to match the github exactly. In order to allow github webhooks to call this endpoint, we needed to remove the authentication for this page on our site. This is secure because github is stores the secret securely so any bad actors would not be able to guess the key and maliciously push any code. The process to push code is as follows: <br>
```
git add .
git commit -m "your changes"
git push origin main
```
## Summary of changes to HTML file after gzip compression
Before the compression we had a full fize size of 1.4 kB and no content encoding header. <br>
After the compression we have a smaller size of 0.8 kB and header `Content-Encoding: gzip` <br>
This indicates that the server is compressing the file before sending it to the browser.
## Summary of removing server header
Originally, the server header was `Server: Apache/2.4.58 (Ubuntu)` which revealed our server software and version to potential attackers. Our solution was to use `mod_security` which hooks into Apache and at a low level in order to modify the server header. We first installed mod_security by running commands:
```
   sudo apt install libapache2-mod-security2
   sudo a2enmod security2
```
Then added to `/etc/apache2/apache2.conf`:
`SecServerSignature "CSE135 Server"`
And then restarted the apache server. The server header now shows `Server: CSE135 Server` instead of revealing our apache version.