FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE 1  # Prevents python from writing .pyc files
ENV PYTHONUNBUFFERED 1       # Prevents python from buffering stdout/stderr


WORKDIR /app

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5001

CMD ["gunicorn", "--bind", "0.0.0.0:5001", "--timeout", "120", "run:app"]