import random


def read_dummy_metrics():
    return {
        "metric_1": round(random.uniform(25.0, 32.0), 2),
        "metric_2": round(random.uniform(45.0, 75.0), 2),
        "metric_3": round(random.uniform(215.0, 230.0), 2),
    }
