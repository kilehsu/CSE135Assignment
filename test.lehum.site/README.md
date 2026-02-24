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

## Screenshot

Take **target-site.jpg** (or similar) of the live site for submission.
