"""Run from the source directory: python -m personnel.users USERNAME."""

import argparse
from getpass import getpass

from personnel.store import connect, initialize, set_user
from settings import load_settings


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("username", nargs="?")
    parser.add_argument("--config")
    parser.add_argument("--disable", action="store_true")
    parser.add_argument("--backup", help="write an online SQLite backup to this private path")
    args = parser.parse_args()
    if not args.backup and not args.username:
        parser.error("Specify a username")
    settings = load_settings(args.config)
    initialize(settings.database)
    if args.backup:
        from pathlib import Path
        target = Path(args.backup).resolve()
        if target.is_relative_to(settings.public_dir.resolve()) or target == settings.database.resolve():
            parser.error("Backup must be a separate private file")
        if target.exists():
            parser.error("Choose a new backup filename; existing backups are not overwritten")
        with connect(settings.database) as source, connect(target) as destination:
            source.backup(destination)
        target.chmod(0o600)
        print("Database backup completed.")
    elif args.disable:
        with connect(settings.database) as db:
            result = db.execute("UPDATE staff_users SET enabled=0 WHERE username=?", (args.username,))
        if not result.rowcount:
            parser.error("Unknown username")
        print("Account disabled.")
    else:
        password = getpass("New password (12-256 characters): ")
        if password != getpass("Repeat password: "):
            parser.error("Passwords do not match")
        try:
            set_user(settings.database, args.username, password)
        except ValueError as error:
            parser.error(str(error))
        print("Account created/reset and enabled.")


if __name__ == "__main__":
    main()
