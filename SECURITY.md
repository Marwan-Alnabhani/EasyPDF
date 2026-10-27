# Security policy

easyPDF opens PDF files that may come from anyone, so security problems are taken seriously.

## Reporting a vulnerability

Please **don't open a public issue** for security problems. Instead, report them privately through
GitHub: go to the [Security tab](https://github.com/Marwan-Alnabhani/EasyPDF/security) and choose
**Report a vulnerability**.

Include what you can of:

- what the problem is and what an attacker could do with it
- steps or a sample file to reproduce it (attach the file to the private report, not anywhere public)
- the easyPDF version, and whether you used the web app or the desktop app

## Supported versions

Only the latest release gets security fixes.

## Scope

In scope, for example:

- a crafted PDF or image that runs code, reads local files, or makes the app contact the network
- a way for the desktop app to write files anywhere other than where the user chose to save
- weaknesses in the Content-Security-Policy or the desktop app's permissions

Out of scope:

- bugs in pdf.js, pdf-lib or Tauri themselves (please report those to the projects directly; tell us too
  if easyPDF needs to update)
- the unsigned installer warning from Windows SmartScreen (a known limitation)
