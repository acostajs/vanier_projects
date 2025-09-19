from app import create_app, db

app = create_app()

with app.app_context():
    print("Attempting db.create_all() via script inside container...")
    db.create_all()
    print("db.create_all() finished via script.")
