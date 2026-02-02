# HW 2 - Server Side Basics and Analytics 3+ Ways

## Links
- **Team Website**: [https://www.lehum.site](https://www.lehum.site)
- **Homework 2 Links**: All CGI programs and the Echo Form are linked under the "Homework 2" section on the homepage.
- **Echo Form**: [Echo Form Application](https://www.lehum.site/hw2/echo_form.html)

## Team Members
- Aaron Chiuwei
- Kile Hsu
- Varun Sharma

## Server Information
- **IP Address**: `159.89.157.16`
- **Grader Login**:
  - User: `grader`
  - Password: `VarunSharma12345!`
- **SSH/Server Access**: Same credentials as above.

## Part 2: CGI Demos 3 Ways
We implemented the required CGI programs in **PHP**, **Python**, and **Ruby**.
All programs are accessible from the [homepage](https://www.lehum.site).

### Languages Used:
1.  **PHP** (Native Apache support/CGI)
2.  **Python** (CGI)
3.  **Ruby** (CGI)

### Components:
For each language, we implemented:
-   `hello-html`: Prints an HTML greeting with date/time and IP.
-   `hello-json`: Returns the same data in JSON format.
-   `environment`: Dumps server environment variables.
-   `echo`: Echoes submitted form data (handles GET/POST/PUT/DELETE and JSON/Form-Data).
-   `state`: Server-side session management (Native for PHP, File-based for Python/Ruby).

## Part 3: Third Party Analytics Discussion

### Approach 3: Free Choice - GoatCounter
For our third option, we chose **GoatCounter**.

**Why we picked it**: 
We wanted to explore a **privacy-first** alternative to Google Analytics. GoatCounter is open-source, lightweight, and we also saw that it was GDPR compliant. It tracks usage statistics without tracking individual users' personal data.

**Evaluation and Analysis**:
-   **Pros**: Extremely simple setup (just a script tag), very clean and readable dashboard, no heavy impact on page load performance.
-   **Cons**: Less detailed demographic data compared to Google Analytics (which is by design).
-   **Conclusion**: It is a great choice if you care about user privacy and just want basic traffic numbers. It was also much easier to set up than the other tools.
