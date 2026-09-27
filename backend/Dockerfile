# TensorFlow 2.18 wheels top out at Python 3.12, so pin the base image there
# rather than tracking "latest" python.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# libGL/libglib are needed by OpenCV even in the headless build.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libglib2.0-0 \
        libgomp1 \
        curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

# Model training fine-tunes MobileNetV2. Cache its ImageNet weights in the
# image so a run also works on a server without internet access. A build
# without network skips this; the first training run then downloads them.
RUN python -c "import tensorflow as tf; tf.keras.applications.MobileNetV2(input_shape=(224, 224, 3), include_top=False, weights='imagenet')" \
    || echo "MobileNetV2 weights not cached; they will be downloaded on first training run"

COPY . .

RUN mkdir -p /app/storage

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
