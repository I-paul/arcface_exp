import pandas as pd

df = pd.read_csv("tests/preprocessing/results/preprocessing_results.csv")

print("\nAcceptance rate:")
print(df.groupby("dataset")["usable"].mean())

print("\nReject reasons:")
print(df.groupby(["dataset", "reject_reason"]).size())

print("\nLatency ms:")
print(df["latency_ms"].describe())
