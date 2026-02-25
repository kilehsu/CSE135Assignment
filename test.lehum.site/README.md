# test.lehum.site — HW3 Test Target Site

Multi-page test site for CSE 135 HW3. Use it at **test.lehum.site** once the vhost is configured.

## Contents

- **index.html** — Home: counter, quick poll, links to other pages
- **feedback.html** — Feedback form (rating, comment, category)
- **contact.html** — Contact form (name, email, subject, message)
- **quiz.html** — Interactive quiz (click-to-answer, instant feedback)
- **css/site.css** — Shared styles (dark theme, forms, quiz)

## Requirements met

- Multiple pages (4)
- Forms (feedback, contact, poll on home)
- Interactive elements (counter buttons, quiz clicks, form submits)

## Deploy

1. Point the **test.lehum.site** vhost document root at `public_html/`.
2. Copy or symlink this `public_html` to the server’s test site root.
3. For HW3 Part 3, add your collector script from collector.lehum.site, e.g.:
   ```html
   <script src="https://collector.lehum.site/collector.js"></script>
   ```

## Logging (Part 2)

- **Access log:** `test.lehum.site-access.log` in `${APACHE_LOG_DIR}` (e.g. `/var/log/apache2/`).
- **Error log:** `test.lehum.site-error.log` in the same directory.
- **Extended format:** Access log uses a custom format with combined fields plus **client hint** headers: `Sec-CH-UA`, `Sec-CH-UA-Mobile`, `Sec-CH-UA-Platform`, viewport/device/DPR, model/form-factors, prefers-color-scheme, prefers-reduced-motion, `Save-Data`.
- **Client hints:** The vhost sends the `Accept-CH` response header so browsers send client hints on later requests; those values are logged. See [MDN: Client hints](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Client_hints). Config: repo root `apache-test.lehum.site.conf`.

## Screenshot

Take **target-site.jpg** (or similar) of the live site for submission.
