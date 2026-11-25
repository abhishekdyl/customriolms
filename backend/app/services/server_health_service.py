"""Live snapshot of the machine this backend runs on — CPU, RAM, and
disk usage of the volume holding both uploaded content and (usually)
the Postgres data directory. This is deliberately NOT per-org: every
org's traffic and files are served by this same process/disk, so
there's exactly one "is the server healthy" reading, shown once at the
top of the Usage Monitoring page rather than duplicated per org.

No history is stored here — each call to snapshot() reads the live
values fresh via psutil. If a trend over time is ever wanted, that's a
separate scheduled job writing periodic rows, not a change to this
function.
"""
import psutil

from app.services.storage_service import _local_root


def snapshot() -> dict:
    cpu_percent = psutil.cpu_percent(interval=0.2)
    mem = psutil.virtual_memory()

    # Disk usage of the volume that actually holds uploaded content
    # (STORAGE_ROOT) — falls back gracefully to "/" if that path isn't
    # resolvable yet (e.g. directory not created on a brand new box).
    try:
        disk_path = str(_local_root())
    except Exception:
        disk_path = "/"
    try:
        disk = psutil.disk_usage(disk_path)
    except (FileNotFoundError, OSError):
        disk = psutil.disk_usage("/")

    return {
        "cpu_percent": cpu_percent,
        "ram_percent": mem.percent,
        "ram_used_mb": round(mem.used / (1024 * 1024)),
        "ram_total_mb": round(mem.total / (1024 * 1024)),
        "disk_percent": disk.percent,
        "disk_used_gb": round(disk.used / (1024 ** 3), 1),
        "disk_total_gb": round(disk.total / (1024 ** 3), 1),
    }
