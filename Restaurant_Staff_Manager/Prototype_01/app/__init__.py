from flask import Flask
from config import Config
from flask_sqlalchemy import SQLAlchemy
from flask_mail import Mail


db = SQLAlchemy()
mail = Mail()


def create_app(config_class=Config):
    app = Flask(__name__, instance_relative_config=True)
    app.config.from_object(config_class)

    db.init_app(app)
    mail.init_app(app)

    from app.routes import bp as main_blueprint

    app.register_blueprint(main_blueprint)

    from app.admin import bp as admin_blueprint

    app.register_blueprint(admin_blueprint)

    from . import models

    print(f"Using database at: {app.config['SQLALCHEMY_DATABASE_URI']}")

    return app
