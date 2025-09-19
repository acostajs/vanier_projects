# app/utils/notifications.py

from flask_mail import Message  # Import Message class
from app import mail  # Import the mail instance from app/__init__.py
from flask import (
    current_app,
    render_template,
)  # Import current_app for config, render_template for HTML body
import logging  # Optional: for better logging

# Configure logger (optional, but good practice)
log = logging.getLogger(__name__)


def send_schedule_update_email(employee, shifts):
    """
    Sends an email to an employee with their assigned shifts.

    Args:
        employee (Employee): The Employee object (must have .name and .email).
        shifts (list): A list of Shift objects assigned to this employee for the period.

    Returns:
        bool: True if email sending was attempted (doesn't guarantee delivery), False on error.
    """
    if not (employee and employee.email):
        log.warning(
            f"Attempted to send schedule email to employee ID {employee.id if employee else 'N/A'} but email address is missing."
        )
        return False

    if not shifts:
        log.info(
            f"No shifts to notify for employee {employee.name} ({employee.email}). Email not sent."
        )
        return True  # Not an error, just nothing to send

    try:
        # Get sender from app config (set in .env)
        sender_email = current_app.config["MAIL_DEFAULT_SENDER"]
        if not sender_email:
            log.error("MAIL_DEFAULT_SENDER not configured. Cannot send email.")
            return False

        # Determine date range for subject (find min/max dates in shifts list)
        if shifts:
            min_date = min(s.start_time.date() for s in shifts)
            max_date = max(s.start_time.date() for s in shifts)
            date_range_str = (
                f"{min_date.strftime('%b %d')} - {max_date.strftime('%b %d, %Y')}"
            )
        else:
            date_range_str = "Upcoming Period"  # Fallback subject date

        subject = f"Your Pozole Schedule: {date_range_str}"

        # Create the email message object
        msg = Message(subject=subject, sender=sender_email, recipients=[employee.email])

        # Render the HTML body using the template
        # Pass employee and shifts objects to the template context
        msg.html = render_template(
            "email/schedule_update.html",  # Path to the template
            employee=employee,
            shifts=shifts,
        )

        # Optional: Add a plain text body as fallback
        # msg.body = f"Hi {employee.name},\n\nYour schedule is attached or viewable online.\n\nThanks."

        # Send the email
        log.info(f"Attempting to send schedule email to {employee.email}...")
        mail.send(msg)
        log.info(f"Email sent successfully to {employee.email}.")
        return True

    except Exception as e:
        log.error(
            f"Error sending schedule email to {employee.email}: {e}", exc_info=True
        )  # Log full exception
        # Consider adding more specific error handling or re-trying logic later
        return False
