from flask import render_template, redirect, url_for, flash
from sqlalchemy import desc
from sqlalchemy.exc import IntegrityError
from app import db
from app.admin import bp
from app.forms import EmployeeForm, PerformanceLogForm
from app.models import Employee, Shift, PerformanceLog
from datetime import timedelta


@bp.route("/employees")
def list_employees():
    """Displays a list of all employees."""
    try:
        employees = Employee.query.order_by(Employee.name).all()
        return render_template(
            "admin/employee_list.html", title="Manage Employees", employees=employees
        )
    except Exception as e:
        flash(f"Error loading employee list: {e}", "danger")
        return redirect(url_for("main.index"))


@bp.route("/employee/edit/<int:employee_id>", methods=["GET", "POST"])
def edit_employee(employee_id):
    """Route for editing an existing employee."""
    employee = Employee.query.get_or_404(employee_id)
    form = EmployeeForm(obj=employee)

    if form.validate_on_submit():
        error = False
        if form.email.data != employee.email:
            existing_email = Employee.query.filter(
                Employee.email == form.email.data, Employee.id != employee.id
            ).first()
            if existing_email:
                flash(
                    f'Error: Email "{form.email.data}" is already registered by another employee.',
                    "danger",
                )
                error = True

        if form.name.data != employee.name:
            existing_name = Employee.query.filter(
                Employee.name == form.name.data, Employee.id != employee.id
            ).first()
            if existing_name:
                flash(
                    f'Error: Name "{form.name.data}" is already used by another employee.',
                    "danger",
                )
                error = True

        if not error:
            employee.name = form.name.data
            employee.position = form.position.data
            employee.email = form.email.data
            employee.hourly_rate = form.hourly_rate.data
            try:
                db.session.commit()
                flash(f'Employee "{employee.name}" updated successfully!', "success")
                return redirect(url_for("admin.list_employees"))
            except IntegrityError:
                db.session.rollback()
                flash(
                    "Database error: Could not update employee. Possible duplicate name or email.",
                    "danger",
                )
            except Exception as e:
                db.session.rollback()
                flash(f"An unexpected error occurred: {e}", "danger")

    return render_template("admin/employee_form.html", title="Edit Employee", form=form)


@bp.route("/employee/add", methods=["GET", "POST"])
def add_employee():
    """Route for adding a new employee."""
    form = EmployeeForm()
    if form.validate_on_submit():
        existing_employee = Employee.query.filter(
            (Employee.email == form.email.data) | (Employee.name == form.name.data)
        ).first()
        if existing_employee:
            flash("Error: Employee with that name or email already exists.", "danger")
        else:
            new_employee = Employee(
                name=form.name.data,
                position=form.position.data,
                email=form.email.data,
                hourly_rate=form.hourly_rate.data,
            )
            try:
                db.session.add(new_employee)
                db.session.commit()
                flash(f'Employee "{new_employee.name}" added successfully!', "success")
                return redirect(url_for("admin.list_employees"))
            except IntegrityError:
                db.session.rollback()
                flash(
                    "Database error: Employee with this name or email might already exist.",
                    "danger",
                )
            except Exception as e:
                db.session.rollback()
                flash(f"An unexpected error occurred: {e}", "danger")

    return render_template(
        "admin/employee_form.html", title="Add New Employee", form=form
    )


@bp.route("/employee/delete/<int:employee_id>", methods=["POST"])
def delete_employee(employee_id):
    """Route for deleting an employee."""

    employee = Employee.query.get_or_404(employee_id)
    try:
        has_shifts = Shift.query.filter_by(employee_id=employee.id).first()
        has_logs = PerformanceLog.query.filter_by(employee_id=employee.id).first()

        if has_shifts or has_logs:
            relations = []
            if has_shifts:
                relations.append("shifts")
            if has_logs:
                relations.append("performance logs")
            flash(
                f'Cannot delete employee "{employee.name}" because they have existing {" and ".join(relations)}. Please reassign or delete associated records first.',
                "danger",
            )
        else:
            employee_name = employee.name
            db.session.delete(employee)
            db.session.commit()
            flash(f'Employee "{employee_name}" deleted successfully.', "success")

    except Exception as e:
        db.session.rollback()
        flash(f"Error deleting employee: {e}", "danger")

    return redirect(url_for("admin.list_employees"))


@bp.route("/performance/add", methods=["GET", "POST"])
def add_performance_log():
    form = PerformanceLogForm()
    if form.validate_on_submit():
        employee = form.employee.data
        log_date = form.log_date.data

        try:
            start_of_month = log_date.replace(day=1)
            next_month = start_of_month + timedelta(days=32)
            start_of_next_month = next_month.replace(day=1)

            existing_log = PerformanceLog.query.filter(
                PerformanceLog.employee_id == employee.id,
                PerformanceLog.log_date >= start_of_month,
                PerformanceLog.log_date < start_of_next_month,
            ).first()

            if existing_log:
                flash(
                    f"Error: A performance log already exists for {employee.name} in {log_date.strftime('%B %Y')}. Only one per month allowed.",
                    "danger",
                )
                return render_template(
                    "admin/add_performance.html", title="Log Performance", form=form
                )

        except Exception as e:
            flash(f"Error checking for existing logs: {e}", "danger")
            return render_template(
                "admin/add_performance.html", title="Log Performance", form=form
            )

        new_log = PerformanceLog(
            employee_id=employee.id,
            log_date=log_date,
            rating=form.rating.data,
            notes=form.notes.data,
        )
        try:
            db.session.add(new_log)
            db.session.commit()
            flash(
                f"Performance logged successfully for {employee.name} on {log_date}.",
                "success",
            )
            return redirect(url_for("admin.add_performance_log"))
        except Exception as e:
            db.session.rollback()
            flash(f"Database error saving performance log: {e}", "danger")
            return render_template(
                "admin/add_performance.html", title="Log Performance", form=form
            )

    return render_template(
        "admin/add_performance.html", title="Log Performance", form=form
    )


@bp.route("/performance/dashboard")
def performance_dashboard():
    """Displays recorded performance logs in a table."""
    print("Accessed /performance_dashboard route")
    try:
        logs = (
            db.session.query(PerformanceLog)
            .join(PerformanceLog.employee)
            .order_by(desc(PerformanceLog.log_date), Employee.name)
            .all()
        )

        print(f"Found {len(logs)} performance logs.")

        return render_template(
            "admin/performance_dashboard.html", title="Performance Dashboard", logs=logs
        )

    except Exception as e:
        print(f"Error querying performance logs: {e}")
        flash("Error loading performance dashboard.", "danger")
        return redirect(url_for("main.index"))
