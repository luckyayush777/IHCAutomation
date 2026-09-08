#!/home/website/ihc-venv/bin/python
"""Install outside DocumentRoot at /home/website/ihc-cgi/personnel.cgi."""
import sys

sys.path.insert(0, "/home/website/html/ihc/src")
from personnel.handler import main

main()
