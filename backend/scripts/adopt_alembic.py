"""Bring a pre-Alembic database up to the baseline revision, once.

Before Alembic the schema was produced by `Base.metadata.create_all`, which
creates missing *tables* but never alters an existing one. Any database that
was running while a column was added is therefore short of that column, and the
API fails on it with `no such column` / `UndefinedColumn`.

This script closes that gap so `alembic upgrade head` can take over:

  1. create any table the models define but the database lacks,
  2. add any column the models define but the table lacks,
  3. drop `training_runs`, the placeholder the Training page replaced,
  4. stamp the database at the baseline revision.

It is a one-off adoption step, not a migration. Run it once per existing
database; afterwards `alembic upgrade head` is the only command needed, and it
is a no-op on a database created fresh from the migrations.

    python scripts/adopt_alembic.py            # report only
    python scripts/adopt_alembic.py --apply    # make the changes
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from sqlalchemy import inspect, text  # noqa: E402
from sqlalchemy.schema import CreateTable  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.db.session import Base, engine  # noqa: E402
from app.models import entities  # noqa: F401,E402  (registers the tables)

# Tables that existed before and no longer have a model. `training_runs` was
# the placeholder the Training page kept its deferred-feature rows in; it is
# replaced by `trained_models`.
OBSOLETE_TABLES = ["training_runs"]


def column_ddl_type(column) -> str:
    """The dialect's own SQL type for one column."""
    return column.type.compile(dialect=engine.dialect)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="make the changes")
    args = parser.parse_args()

    inspector = inspect(engine)
    existing = set(inspector.get_table_names())

    missing_tables = [t for t in Base.metadata.sorted_tables if t.name not in existing]
    missing_columns: list[tuple[str, object]] = []
    for table in Base.metadata.sorted_tables:
        if table.name not in existing:
            continue
        have = {c["name"] for c in inspector.get_columns(table.name)}
        for column in table.columns:
            if column.name not in have:
                missing_columns.append((table.name, column))

    obsolete = [t for t in OBSOLETE_TABLES if t in existing]

    print(f"database: {settings.database_url.split('@')[-1]}")
    print(f"  tables to create : {[t.name for t in missing_tables] or 'none'}")
    print(
        "  columns to add   : "
        f"{[f'{t}.{c.name}' for t, c in missing_columns] or 'none'}"
    )
    print(f"  tables to drop   : {obsolete or 'none'}")

    if not args.apply:
        print("\nreport only; pass --apply to make these changes")
        return 0

    with engine.begin() as connection:
        for table in missing_tables:
            connection.execute(CreateTable(table))
            print(f"  created {table.name}")

        for table_name, column in missing_columns:
            # Every column added since the first release is nullable, so no
            # backfill is needed and existing rows stay valid.
            if not column.nullable and column.server_default is None:
                print(
                    f"  SKIPPED {table_name}.{column.name}: NOT NULL with no default "
                    "cannot be added to a table with rows. Add it by hand."
                )
                continue
            connection.execute(
                text(
                    f'ALTER TABLE "{table_name}" '
                    f'ADD COLUMN "{column.name}" {column_ddl_type(column)}'
                )
            )
            print(f"  added {table_name}.{column.name}")

        for table_name in obsolete:
            connection.execute(text(f'DROP TABLE "{table_name}"'))
            print(f"  dropped {table_name}")

    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    command.stamp(config, "head")
    print("\nstamped at head; `alembic upgrade head` now manages this database")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
