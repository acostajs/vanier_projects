from app import db
import datetime


class Employee(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(64), index=True, unique=True)
    position = db.Column(db.String(64))
    email = db.Column(db.String(120), index=True, unique=True)
    hourly_rate = db.Column(db.Float)

    def __repr__(self):
        return f"<Employee {self.name}>"


class Shift(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(
        db.Integer, db.ForeignKey("employee.id"), nullable=True, index=True
    )
    start_time = db.Column(db.DateTime, nullable=False, index=True)
    end_time = db.Column(db.DateTime, nullable=False)
    required_position = db.Column(db.String(64), nullable=False, index=True)
    employee = db.relationship("Employee", backref="shifts")

    def __repr__(self):
        emp_name = self.employee.name if self.employee else "Unassigned"
        return f"<Shift P:{self.required_position} E:{emp_name} Start:{self.start_time.strftime('%H:%M')}>"


class PerformanceLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(
        db.Integer, db.ForeignKey("employee.id"), nullable=False, index=True
    )
    log_date = db.Column(
        db.Date, nullable=False, index=True, default=datetime.date.today
    )
    rating = db.Column(db.Float)
    notes = db.Column(db.Text)
    recorded_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)
    employee = db.relationship(
        "Employee", backref=db.backref("performance_logs", lazy="dynamic")
    )

    def __repr__(self):
        return f"<PerformanceLog E:{self.employee_id} D:{self.log_date} Rating:{self.rating}>"
