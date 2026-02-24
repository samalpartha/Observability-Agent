"""
Notifier tool: Sends real-time alerts via Twilio (WhatsApp/SMS) and SMTP (Email).
"""
import os
import smtplib
from email.mime.text import MIMEText
from typing import Optional
try:
    from twilio.rest import Client
except ImportError:
    Client = None
from agent.resilience import logger

class Notifier:
    def __init__(self):
        self.twilio_sid = os.getenv("TWILIO_ACCOUNT_SID")
        self.twilio_auth_token = os.getenv("TWILIO_AUTH_TOKEN")
        self.twilio_from = os.getenv("TWILIO_FROM_NUMBER")  # e.g., 'whatsapp:+14155238886'
        self.target_phone = os.getenv("TARGET_PHONE_NUMBER")
        
        self.smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
        self.smtp_port = int(os.getenv("SMTP_PORT", "587"))
        self.smtp_user = os.getenv("SMTP_USER")
        self.smtp_pass = os.getenv("SMTP_PASS")
        self.target_email = os.getenv("TARGET_EMAIL")

    def send_whatsapp(self, message: str) -> bool:
        """Send a WhatsApp message via Twilio."""
        if not (self.twilio_sid and self.twilio_auth_token and self.target_phone):
            logger.warning("Twilio credentials not configured. Skipping WhatsApp alert.")
            return False
            
        try:
            client = Client(self.twilio_sid, self.twilio_auth_token)
            msg = client.messages.create(
                from_=f"whatsapp:{self.twilio_from}",
                body=f"🚨 *Observability Alert* 🚨\n\n{message}",
                to=f"whatsapp:{self.target_phone}"
            )
            logger.info(f"WhatsApp alert sent: {msg.sid}")
            return True
        except Exception as e:
            logger.error(f"Failed to send WhatsApp alert: {e}")
            return False

    def send_email(self, subject: str, body: str) -> bool:
        """Send an email via SMTP."""
        if not (self.smtp_user and self.smtp_pass and self.target_email):
            logger.warning("SMTP credentials not configured. Skipping email alert.")
            return False
            
        try:
            msg = MIMEText(body)
            msg["Subject"] = subject
            msg["From"] = self.smtp_user
            msg["To"] = self.target_email
            
            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                server.starttls()
                server.login(self.smtp_user, self.smtp_pass)
                server.send_message(msg)
            logger.info(f"Email alert sent to {self.target_email}")
            return True
        except Exception as e:
            logger.error(f"Failed to send email alert: {e}")
            return False

def tool_notify_incident(severity: str, summary: str, details: str = "") -> dict:
    """
    High-level tool for agents to notify about critical incidents.
    Automatically chooses the best channel based on severity.
    """
    notifier = Notifier()
    status = {"whatsapp": False, "email": False}
    
    if severity.lower() in ("critical", "high"):
        status["whatsapp"] = notifier.send_whatsapp(f"{summary}\n\n{details}")
        
    status["email"] = notifier.send_email(
        subject=f"[{severity.upper()}] Observability Incident: {summary}",
        body=f"Incident Details:\n\n{details}\n\n---\nObservability Copilot"
    )
    
    return status
