from flask_wtf import FlaskForm
from wtforms import (
    SubmitField,
    FloatField,
    TextAreaField,
    DateField,
    StringField,
    EmailField,
    SelectField,
)
from wtforms.validators import DataRequired, Optional, NumberRange, Email
from wtforms_sqlalchemy.fields import QuerySelectField
from app.models import Employee
import datetime


def employee_query():
    return Employee.query.order_by(Employee.name)


POSITION_CHOICES = [
    ("", "-- Select Position --"),
    # Management
    ("Assistant Manager", "Assistant Manager"),
    ("Bar Manager", "Bar Manager"),
    ("Catering Manager", "Catering Manager"),
    ("Dining Room Manager/Maître D'hotel", "Dining Room Manager/Maître D'hotel"),
    ("Food and Beverage Manager", "Food and Beverage Manager"),
    ("General Manager", "General Manager"),
    ("Kitchen Manager", "Kitchen Manager"),
    ("Shift Manager", "Shift Manager"),
    # Front of House (FOH)
    ("Barback", "Barback"),
    ("Barista", "Barista"),
    ("Bartender", "Bartender"),
    ("Busser", "Busser"),
    ("Cashier", "Cashier"),
    ("Host/Hostess", "Host/Hostess"),
    ("Server", "Server"),
    ("Sommelier", "Sommelier"),
    # Back of House (BOH) - Kitchen Staff
    ("Baker", "Baker"),
    ("Chef de Partie", "Chef de Partie"),
    ("Cook", "Cook"),
    ("Dishwasher", "Dishwasher"),
    ("Executive Chef", "Executive Chef"),
    ("Expediter", "Expediter"),
    ("Fry/Sauté Cook", "Fry/Sauté Cook"),
    ("Garde Manger/Pantry Chef", "Garde Manger/Pantry Chef"),
    ("Grill Cook", "Grill Cook"),
    ("Line Cook", "Line Cook"),
    ("Pastry Chef", "Pastry Chef"),
    ("Prep Cook", "Prep Cook"),
    ("Soup & Sauce Cook/Potager & Saucier", "Soup & Sauce Cook/Potager & Saucier"),
    ("Sous Chef", "Sous Chef"),
    ("Sushi Chef", "Sushi Chef"),
]


class PerformanceLogForm(FlaskForm):
    employee = QuerySelectField(
        "Employee",
        query_factory=employee_query,
        get_label="name",
        allow_blank=True,
        blank_text="-- Select Employee --",
        validators=[DataRequired(message="Please select an employee.")],
    )

    log_date = DateField(
        "Date", default=datetime.date.today, validators=[DataRequired()]
    )

    rating = FloatField(
        "Rating (1-5)",
        validators=[
            Optional(),
            NumberRange(min=1, max=5, message="Rating must be between 1 and 5."),
        ],
    )

    notes = TextAreaField("Notes", validators=[Optional()])

    submit = SubmitField("Log Performance")


class EmployeeForm(FlaskForm):
    """Form for adding or editing an Employee."""

    name = StringField(
        "Name", validators=[DataRequired(message="Employee name is required.")]
    )

    position = SelectField(
        "Position",
        choices=POSITION_CHOICES,
        validators=[DataRequired(message="Please select a position.")],
    )

    email = EmailField(
        "Email",
        validators=[
            DataRequired(),
            Email(message="Please enter a valid email address."),
        ],
    )
    hourly_rate = FloatField(
        "Hourly Rate ($)",
        validators=[
            Optional(),
            NumberRange(min=0, message="Hourly rate cannot be negative."),
        ],
    )
    submit = SubmitField("Save Employee")
