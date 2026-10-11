"""
Measures the real cost of ONE BTS month, so the plan uses measured numbers instead of guesses.

    python ml/scripts/measure_month.py --year 2025 --month 6 --out-dir /tmp/bts-measure

Does one polite download (cached, resumable by re-running), verifies the zip, converts only the
columns the model uses to zstd parquet with DuckDB, and prints download size, CSV size, row
count, parquet size, peak RAM and wall time as JSON. Makes no other network requests.
The URL pattern is the documented PREZIP naming; if BTS changed it, pass --url.
"""
from __future__ import annotations

import argparse, json, os, resource, time, urllib.request, zipfile

URL = "https://www.transtats.bts.gov/PREZIP/On_Time_Reporting_Carrier_On_Time_Performance_1987_present_{y}_{m}.zip"
COLS = ["FlightDate", "Reporting_Airline", "Flight_Number_Reporting_Airline", "Tail_Number", "Origin", "Dest",
        "CRSDepTime", "CRSArrTime", "DepDelay", "ArrDelay", "Cancelled", "Diverted", "Distance"]


def download(url: str, dest: str) -> None:
    if os.path.exists(dest):
        return
    req = urllib.request.Request(url, headers={"User-Agent": "vola-ripple-ml/1.0 (research; contact via repo)"})
    tmp = dest + ".part"
    with urllib.request.urlopen(req, timeout=120) as r, open(tmp, "wb") as fh:
        while chunk := r.read(1 << 20):
            fh.write(chunk)
    os.replace(tmp, dest)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", type=int, required=True)
    ap.add_argument("--month", type=int, required=True)
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--url")
    ap.add_argument("--zip", help="use an already downloaded zip instead of downloading")
    a = ap.parse_args()
    import duckdb

    os.makedirs(a.out_dir, exist_ok=True)
    zpath = a.zip or os.path.join(a.out_dir, f"bts_{a.year}_{a.month}.zip")
    t0 = time.time()
    if not a.zip:
        download(a.url or URL.format(y=a.year, m=a.month), zpath)
    t_dl = time.time() - t0
    with zipfile.ZipFile(zpath) as z:
        bad = z.testzip()
        if bad:
            raise SystemExit(f"corrupt zip member {bad}")
        member = next(n for n in z.namelist() if n.lower().endswith(".csv"))
        csv_bytes = z.getinfo(member).file_size
        z.extract(member, a.out_dir)
    csv = os.path.join(a.out_dir, member)
    pq = os.path.join(a.out_dir, f"bts_{a.year}_{a.month}.parquet")
    t1 = time.time()
    con = duckdb.connect()
    con.execute("PRAGMA memory_limit='2GB'")
    cols = ", ".join(COLS)
    con.execute(f"COPY (SELECT {cols} FROM read_csv('{csv}', header=true, sample_size=-1, ignore_errors=false)) TO '{pq}' (FORMAT PARQUET, COMPRESSION ZSTD)")
    rows = con.execute(f"SELECT count(*) FROM '{pq}'").fetchone()[0]
    airports = con.execute(f"SELECT count(DISTINCT Origin) FROM '{pq}'").fetchone()[0]
    tails = con.execute(f"SELECT avg((Tail_Number IS NOT NULL AND length(trim(Tail_Number))>1)::INT) FROM '{pq}'").fetchone()[0]
    print(json.dumps({
        "download_zip_mb": round(os.path.getsize(zpath) / 1e6, 1), "download_seconds": round(t_dl, 1),
        "csv_mb": round(csv_bytes / 1e6, 1), "rows": rows, "origin_airports": airports, "tail_number_share": round(tails, 4),
        "parquet_mb": round(os.path.getsize(pq) / 1e6, 1), "convert_seconds": round(time.time() - t1, 1),
        "peak_rss_mb": round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, 0),
    }, indent=2))


if __name__ == "__main__":
    main()
