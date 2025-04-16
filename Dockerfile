# syntax=docker/dockerfile:1

ARG PYTHON_VERSION=3.12.9

FROM python:${PYTHON_VERSION}-slim

LABEL fly_launch_runtime="flask"

WORKDIR /code

COPY requirements.txt requirements.txt
RUN pip3 install -r requirements.txt

COPY . .

RUN git rev-parse --short HEAD > .version || echo "unknown" > .version

EXPOSE 8080

CMD [ "python3", "-m" , "flask", "run", "--host=0.0.0.0", "--port=8080"]
