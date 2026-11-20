#!/usr/bin/env python3
"""Send one plain-text alert through an SMTP relay (QQ Mail / generic SMTP)."""
import os
import smtplib
import ssl
import sys
from email.message import EmailMessage
from urllib.parse import urlparse


def main() -> int:
    subject = sys.argv[1] if len(sys.argv) > 1 else "Campus alert"
    body = sys.argv[2] if len(sys.argv) > 2 else "No details provided"
    to_addr = os.environ.get("ALERT_EMAIL_TO", "2576264825@qq.com")
    from_addr = os.environ.get("ALERT_EMAIL_FROM", "")
    url = os.environ.get("ALERT_SMTP_URL", "smtps://smtp.qq.com:465")
    user = os.environ.get("ALERT_SMTP_USER", "")
    password = os.environ.get("ALERT_SMTP_PASS", "")
    timeout = float(os.environ.get("ALERT_SMTP_TIMEOUT", "15"))

    if os.environ.get("ALERT_DRY_RUN") == "1":
        print(f"DRY RUN\nTo: {to_addr}\nFrom: {from_addr or '<unset>'}\nSubject: {subject}\n\n{body}")
        return 0
    if not from_addr or not user or not password:
        print("ALERT_EMAIL_FROM / ALERT_SMTP_USER / ALERT_SMTP_PASS are required", file=sys.stderr)
        return 2

    parsed = urlparse(url)
    host = parsed.hostname or "smtp.qq.com"
    port = parsed.port or (465 if parsed.scheme == "smtps" else 587)
    use_ssl = parsed.scheme == "smtps" or port == 465

    message = EmailMessage()
    message["From"] = from_addr
    message["To"] = to_addr
    message["Subject"] = subject.replace("\r", " ").replace("\n", " ")
    message.set_content(body)

    context = ssl.create_default_context()
    if use_ssl:
        client = smtplib.SMTP_SSL(host, port, timeout=timeout, context=context)
    else:
        client = smtplib.SMTP(host, port, timeout=timeout)
        client.starttls(context=context)
    try:
        client.login(user, password)
        client.send_message(message)
    finally:
        try:
            client.quit()
        except Exception:
            pass
    print(f"sent alert to {to_addr}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
